import { withSupabase } from "npm:@supabase/server@1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const digits = (value: string) => value.replace(/\D/g, "");
const safeError = (value: unknown) => String(value ?? "provider_error").replace(/[\r\n]/g, " ").slice(0, 180);

function findProviderId(value: unknown, depth = 0): string {
  if (!value || typeof value !== "object" || depth > 4) return "";
  const obj = value as Record<string, unknown>;
  for (const key of ["uid", "id", "message_id", "sms_id", "message_uid"]) {
    if (typeof obj[key] === "string" || typeof obj[key] === "number") return String(obj[key]);
  }
  for (const nested of Object.values(obj)) {
    const found = findProviderId(nested, depth + 1);
    if (found) return found;
  }
  return "";
}

async function sendEsms(to: string, message: string) {
  const token = Deno.env.get("SMS_API_TOKEN");
  const senderId = Deno.env.get("SMS_SENDER_ID");
  if (!token || !senderId) return { ok: false, providerId: "", code: "sms_not_configured", detail: "eSMS API token or Sender ID is missing." };
  const endpoint = Deno.env.get("SMS_API_URL") || "https://login.esms.com.bd/api/v3/sms/send";
  const parsed = new URL(endpoint);
  if (parsed.protocol !== "https:" || parsed.hostname !== "login.esms.com.bd" || parsed.pathname !== "/api/v3/sms/send") {
    return { ok: false, providerId: "", code: "sms_endpoint_invalid", detail: "SMS endpoint must be the official eSMS Bangladesh send endpoint." };
  }
  const form = new URLSearchParams();
  form.set("recipient", to);
  form.set("sender_id", senderId);
  form.set("type", "plain");
  form.set("message", message);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + token,
      "Accept": "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json().catch(() => ({}));
  const ok = response.ok && String(data?.status || "").toLowerCase() === "success";
  return {
    ok,
    providerId: findProviderId(data?.data) || findProviderId(data),
    code: ok ? "" : "esms_http_" + response.status,
    detail: ok ? "" : safeError(data?.message || "eSMS did not confirm successful acceptance."),
  };
}

const handler = withSupabase({ auth: "user" }, async (req, ctx) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const callerId = ctx.userClaims?.id ?? ctx.jwtClaims?.sub;
  if (!callerId) return json({ error: "Authentication required" }, 401);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "Server database credentials are not configured." }, 500);
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: profile, error: profileError } = await admin.from("profiles")
    .select("role,institution").eq("id", callerId).single();
  if (profileError || !profile) return json({ error: "Profile not found." }, 403);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON." }, 400); }
  const action = String(body.action ?? "dispatch");
  const waConfigured = Boolean(Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") && Deno.env.get("WHATSAPP_ACCESS_TOKEN"));
  const smsConfigured = Boolean(Deno.env.get("SMS_API_TOKEN") && Deno.env.get("SMS_SENDER_ID"));

  if (!["super_admin", "admin", "accounts_manager", "accountant", "mosque_admin", "foundation_admin"].includes(profile.role)
      && profile.role !== "custom_admin") return json({ error: "Message dispatch permission required." }, 403);
  if (profile.role === "custom_admin") {
    const { data: grants } = await admin.from("admin_module_permissions").select("module_key,can_write")
      .eq("user_id", callerId).gte("module_key", "m41").lte("module_key", "m50").eq("can_write", true);
    if (!grants?.length) return json({ error: "Accounts message write permission required." }, 403);
  }
  if (action === "config") {
    return json({ whatsappConfigured: waConfigured, smsConfigured, ready: waConfigured || smsConfigured,
      whatsappTemplateConfigured: Boolean(Deno.env.get("WHATSAPP_TEMPLATE_NAME")) });
  }

  const messageId = String(body.message_id ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(messageId)) {
    return json({ error: "Valid message_id is required." }, 400);
  }
  const { data: message, error: messageError } = await admin.from("accounts_message_queue")
    .select("*").eq("id", messageId).single();
  if (messageError || !message) return json({ error: "Message not found." }, 404);
  if (profile.institution !== "both" && profile.institution !== message.institution) return json({ error: "Institution access denied." }, 403);
  if (profile.role === "mosque_admin" && message.institution !== "mosque") return json({ error: "Institution access denied." }, 403);
  if (profile.role === "foundation_admin" && message.institution !== "foundation") return json({ error: "Institution access denied." }, 403);

  if (message.status !== "queued" && message.status !== "failed") {
    return json({ error: "Only queued or failed messages can be dispatched.", status: message.status }, 409);
  }
  const { data: claimed, error: claimError } = await admin.from("accounts_message_queue")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("id", messageId).in("status", ["queued", "failed"]).select("*").maybeSingle();
  if (claimError || !claimed) return json({ error: "Message is already being processed or is not retryable." }, 409);

  let attemptCount = Number(claimed.attempt_count || 0);
  const recordAttempt = async (channel: "whatsapp" | "sms", status: "accepted" | "failed",
    providerId = "", code = "", detail = "") => {
    const { error } = await admin.from("accounts_message_attempts").insert({
      message_id: messageId, channel, status, provider_message_id: providerId,
      error_code: code, error_message: detail,
    });
    if (error) console.error("Could not write message attempt:", error.message);
    attemptCount += 1;
    await admin.from("accounts_message_queue").update({
      attempt_count: attemptCount,
      updated_at: new Date().toISOString(),
    }).eq("id", messageId);
  };

  const to = digits(String(claimed.recipient_phone));
  let waError = "whatsapp_not_configured";
  if (waConfigured) {
    try {
      const version = Deno.env.get("WHATSAPP_API_VERSION") || "v27.0";
      const endpoint = "https://graph.facebook.com/" + version + "/" + Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") + "/messages";
      const templateName = Deno.env.get("WHATSAPP_TEMPLATE_NAME");
      const payload = templateName
        ? {
            messaging_product: "whatsapp", recipient_type: "individual", to, type: "template",
            template: {
              name: templateName,
              language: { code: Deno.env.get("WHATSAPP_TEMPLATE_LANGUAGE") || "bn" },
              components: [{ type: "body", parameters: [{ type: "text", text: claimed.message }] }],
            },
          }
        : {
            messaging_product: "whatsapp", recipient_type: "individual", to,
            type: "text", text: { preview_url: false, body: claimed.message },
          };
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Authorization": "Bearer " + Deno.env.get("WHATSAPP_ACCESS_TOKEN"), "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data?.messages?.[0]?.id) {
        const providerId = String(data.messages[0].id);
        await recordAttempt("whatsapp", "accepted", providerId);
        await admin.from("accounts_message_queue").update({
          status: "awaiting_delivery", active_channel: "whatsapp", provider_message_id: providerId,
          updated_at: new Date().toISOString(),
        }).eq("id", messageId);
        return json({ success: true, status: "awaiting_delivery", channel: "whatsapp" });
      }
      waError = "whatsapp_http_" + response.status;
      await recordAttempt("whatsapp", "failed", "", waError, safeError(data?.error?.message || "WhatsApp request rejected"));
    } catch (error) {
      waError = "whatsapp_network_error";
      await recordAttempt("whatsapp", "failed", "", waError, safeError(error instanceof Error ? error.message : error));
    }
  } else {
    await recordAttempt("whatsapp", "failed", "", waError, "WhatsApp provider credentials are not configured.");
  }

  if (smsConfigured) {
    try {
      const sms = await sendEsms(to, claimed.message);
      if (sms.ok) {
        await recordAttempt("sms", "accepted", sms.providerId);
        await admin.from("accounts_message_queue").update({
          status: "awaiting_delivery", active_channel: "sms", provider_message_id: sms.providerId,
          updated_at: new Date().toISOString(),
        }).eq("id", messageId);
        return json({ success: true, status: "awaiting_delivery", channel: "sms", fallback: true });
      }
      await recordAttempt("sms", "failed", sms.providerId, sms.code, sms.detail);
    } catch (error) {
      await recordAttempt("sms", "failed", "", "sms_network_error", safeError(error instanceof Error ? error.message : error));
    }
  } else {
    await recordAttempt("sms", "failed", "", "sms_not_configured", "eSMS API token or Sender ID is not configured.");
  }

  await admin.from("accounts_message_queue").update({
    status: "failed", active_channel: "none", updated_at: new Date().toISOString(),
  }).eq("id", messageId);
  return json({ success: false, status: "failed", reason: waError, message: "WhatsApp and eSMS delivery attempts failed or are not configured." }, 502);
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try { return await handler(req); }
  catch (error) {
    console.error("message-dispatch failed:", error);
    return json({ error: "Unexpected message dispatch error." }, 500);
  }
});
