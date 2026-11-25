import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-hub-signature-256, x-message-webhook-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const text = (body: string, status = 200) =>
  new Response(body, { status, headers: { ...cors, "Content-Type": "text/plain; charset=utf-8" } });
const digits = (value: string) => value.replace(/\D/g, "");
const safeError = (value: unknown) => String(value ?? "provider_error").replace(/[\r\n]/g, " ").slice(0, 180);

function equalSecret(a: string, b: string) {
  const enc = new TextEncoder(), x = enc.encode(a), y = enc.encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

async function verifyMetaSignature(rawBody: Uint8Array, header: string, appSecret: string) {
  if (!/^sha256=[0-9a-f]{64}$/i.test(header)) return false;
  const signature = new Uint8Array((header.slice(7).match(/.{2}/g) || []).map((v) => parseInt(v, 16)));
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"],
  );
  return await crypto.subtle.verify("HMAC", key, signature, rawBody);
}

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  if (req.method === "GET") {
    const verifyToken = Deno.env.get("WHATSAPP_VERIFY_TOKEN");
    const params = new URL(req.url).searchParams;
    const mode = params.get("hub.mode") || "";
    const supplied = params.get("hub.verify_token") || "";
    const challenge = params.get("hub.challenge") || "";
    if (!verifyToken) return text("Webhook verification token is not configured.", 503);
    if (mode === "subscribe" && challenge && equalSecret(verifyToken, supplied)) return text(challenge, 200);
    return text("Forbidden", 403);
  }

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const rawBody = new Uint8Array(await req.arrayBuffer());
  const rawText = new TextDecoder().decode(rawBody);
  let body: Record<string, unknown>;
  try { body = JSON.parse(rawText); } catch { return json({ error: "Invalid JSON" }, 400); }

  const appSecret = Deno.env.get("WHATSAPP_APP_SECRET");
  const signature = req.headers.get("x-hub-signature-256") || "";
  const legacySecret = Deno.env.get("MESSAGE_WEBHOOK_SECRET");
  const legacySupplied = req.headers.get("x-message-webhook-secret") || "";
  let isMeta = false;
  if (appSecret) {
    if (!await verifyMetaSignature(rawBody, signature, appSecret)) return json({ error: "Invalid Meta webhook signature" }, 401);
    isMeta = true;
  } else if (!legacySecret || !equalSecret(legacySecret, legacySupplied)) {
    return json({ error: "Webhook authentication is not configured or invalid." }, 401);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "Server credentials unavailable" }, 500);
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const recordAttempt = async (messageId: string, channel: "whatsapp" | "sms", status: "accepted" | "failed" | "delivered" | "read",
    providerId: string, code = "", detail = "") => {
    const { error } = await admin.from("accounts_message_attempts").insert({
      message_id: messageId, channel, status, provider_message_id: providerId,
      error_code: code, error_message: detail,
    });
    if (error) console.error("Could not write delivery attempt:", error.message);
  };

  const processStatus = async (providerId: string, status: string, channel: "whatsapp" | "sms",
    errorCode = "", errorMessage = "") => {
    if (!providerId || !["delivered", "read", "failed"].includes(status)) return;
    const { data: row, error } = await admin.from("accounts_message_queue").select("*")
      .eq("provider_message_id", providerId).eq("active_channel", channel).maybeSingle();
    if (error) throw error;
    if (!row) return;

    if (status === "read" && channel !== "whatsapp") return;
    if (status === "delivered" || status === "read") {
      if (row.status === "read" || (status === "delivered" && row.status === "delivered")) return;
      const now = new Date().toISOString();
      const patch: Record<string, unknown> = {
        status, updated_at: now, delivered_at: row.delivered_at || now,
      };
      if (status === "read") patch.read_at = now;
      const { error: updateError } = await admin.from("accounts_message_queue").update(patch)
        .eq("id", row.id).eq("active_channel", channel).in("status", ["awaiting_delivery", "delivered"]);
      if (updateError) throw updateError;
      await recordAttempt(row.id, channel, status as "delivered" | "read", providerId);
      return;
    }

    // Only a final WhatsApp delivery failure may trigger SMS. A delivered/read message is never downgraded.
    if (channel !== "whatsapp" || row.status !== "awaiting_delivery") {
      if (channel === "sms" && row.status === "awaiting_delivery") {
        await recordAttempt(row.id, "sms", "failed", providerId, errorCode || "sms_delivery_failed", errorMessage || "eSMS reported final delivery failure.");
        await admin.from("accounts_message_queue").update({
          status: "failed", active_channel: "none", updated_at: new Date().toISOString(),
        }).eq("id", row.id).eq("status", "awaiting_delivery").eq("active_channel", "sms");
      }
      return;
    }

    const { data: claimed, error: claimError } = await admin.from("accounts_message_queue")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", row.id).eq("status", "awaiting_delivery").eq("active_channel", "whatsapp")
      .select("*").maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) return;

    await recordAttempt(row.id, "whatsapp", "failed", providerId,
      errorCode || "whatsapp_delivery_failed", errorMessage || "Meta reported final WhatsApp delivery failure.");

    const sms = await sendEsms(digits(String(row.recipient_phone)), String(row.message));
    if (sms.ok) {
      await recordAttempt(row.id, "sms", "accepted", sms.providerId);
      const { error: updateError } = await admin.from("accounts_message_queue").update({
        status: "awaiting_delivery", active_channel: "sms", provider_message_id: sms.providerId,
        attempt_count: Number(row.attempt_count || 0) + 1, updated_at: new Date().toISOString(),
      }).eq("id", row.id).eq("status", "processing");
      if (updateError) throw updateError;
      return;
    }

    await recordAttempt(row.id, "sms", "failed", sms.providerId, sms.code, sms.detail);
    const { error: failError } = await admin.from("accounts_message_queue").update({
      status: "failed", active_channel: "none", attempt_count: Number(row.attempt_count || 0) + 1,
      updated_at: new Date().toISOString(),
    }).eq("id", row.id).eq("status", "processing");
    if (failError) throw failError;
  };

  try {
    if (isMeta) {
      if (body.object !== "whatsapp_business_account") return json({ success: true, ignored: true });
      for (const entry of (Array.isArray(body.entry) ? body.entry : []) as Record<string, unknown>[]) {
        for (const change of (Array.isArray(entry.changes) ? entry.changes : []) as Record<string, unknown>[]) {
          if (change.field !== "messages") continue;
          const value = (change.value && typeof change.value === "object" ? change.value : {}) as Record<string, unknown>;
          for (const item of (Array.isArray(value.statuses) ? value.statuses : []) as Record<string, unknown>[]) {
            const errors = Array.isArray(item.errors) ? item.errors as Record<string, unknown>[] : [];
            const firstError = errors[0] || {};
            await processStatus(
              String(item.id || ""),
              String(item.status || ""),
              "whatsapp",
              String(firstError.code || ""),
              safeError(firstError.title || firstError.message || ""),
            );
          }
        }
      }
      return json({ success: true });
    }

    const providerId = String(body.provider_message_id || "");
    const status = String(body.status || "");
    const channel = body.channel === "sms" ? "sms" : "whatsapp";
    if (!providerId || !["delivered", "read", "failed"].includes(status)) {
      return json({ error: "provider_message_id and a valid status are required" }, 400);
    }
    await processStatus(providerId, status, channel,
      String(body.error_code || ""), safeError(body.error_message || ""));
    return json({ success: true });
  } catch (error) {
    console.error("message-status-webhook failed:", error);
    return json({ error: "Could not process delivery status." }, 500);
  }
});
