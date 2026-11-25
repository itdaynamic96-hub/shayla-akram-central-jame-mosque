import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json" },
});
function equalSecret(a: string, b: string) {
  const enc = new TextEncoder(), x = enc.encode(a), y = enc.encode(b);
  if (x.length !== y.length) return false;
  let diff = 0; for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
const digits = (v: string) => v.replace(/\D/g, "");
Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const secret = Deno.env.get("MESSAGE_WEBHOOK_SECRET");
  const supplied = req.headers.get("x-message-webhook-secret") || "";
  if (!secret || !equalSecret(secret, supplied)) return json({ error: "Unauthorized webhook" }, 401);
  const url = Deno.env.get("SUPABASE_URL"), serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "Server credentials unavailable" }, 500);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const providerId = String(body.provider_message_id || "");
  const status = String(body.status || "");
  if (!providerId || !["delivered", "read", "failed"].includes(status)) return json({ error: "provider_message_id and a valid status are required" }, 400);

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: row, error } = await admin.from("accounts_message_queue").select("*")
    .eq("provider_message_id", providerId).maybeSingle();
  if (error || !row) return json({ error: "Message not found" }, 404);
  if (status === "read" && row.active_channel !== "whatsapp") return json({ error: "Read receipts are supported only for WhatsApp" }, 409);

  if (status === "delivered" || status === "read") {
    if (status === "delivered" && row.status === "read") return json({ success: true, status: "read" });
    await admin.from("accounts_message_attempts").insert({
      message_id: row.id, channel: row.active_channel, status,
      provider_message_id: providerId,
    });
    const patch: Record<string, unknown> = {
      status, updated_at: new Date().toISOString(),
      delivered_at: row.delivered_at || new Date().toISOString(),
    };
    if (status === "read") patch.read_at = new Date().toISOString();
    const { error: updateError } = await admin.from("accounts_message_queue").update(patch).eq("id", row.id);
    if (updateError) return json({ error: "Could not update delivery status" }, 500);
    return json({ success: true, status });
  }

  await admin.from("accounts_message_attempts").insert({
    message_id: row.id, channel: row.active_channel, status: "failed",
    provider_message_id: providerId, error_code: "provider_delivery_failed",
    error_message: "Provider reported final delivery failure.",
  });
  if (row.active_channel === "whatsapp" && Deno.env.get("SMS_API_URL") && Deno.env.get("SMS_API_TOKEN")) {
    try {
      const response = await fetch(String(Deno.env.get("SMS_API_URL")), {
        method: "POST",
        headers: { "Authorization": "Bearer " + Deno.env.get("SMS_API_TOKEN"), "Content-Type": "application/json" },
        body: JSON.stringify({
          to: "+" + digits(String(row.recipient_phone)), message: row.message,
          from: Deno.env.get("SMS_SENDER_ID") || undefined,
        }),
        signal: AbortSignal.timeout(15000),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        const smsId = String(data?.message_id || data?.id || "");
        await admin.from("accounts_message_attempts").insert({
          message_id: row.id, channel: "sms", status: "accepted", provider_message_id: smsId,
        });
        await admin.from("accounts_message_queue").update({
          status: "awaiting_delivery", active_channel: "sms", provider_message_id: smsId,
          attempt_count: Number(row.attempt_count || 0) + 1, updated_at: new Date().toISOString(),
        }).eq("id", row.id);
        return json({ success: true, fallback: "sms", status: "awaiting_delivery" });
      }
      await admin.from("accounts_message_attempts").insert({
        message_id: row.id, channel: "sms", status: "failed",
        error_code: "sms_http_" + response.status, error_message: "SMS provider rejected fallback.",
      });
    } catch {
      await admin.from("accounts_message_attempts").insert({
        message_id: row.id, channel: "sms", status: "failed",
        error_code: "sms_network_error", error_message: "SMS fallback request failed.",
      });
    }
  }
  await admin.from("accounts_message_queue").update({
    status: "failed", active_channel: "none", updated_at: new Date().toISOString(),
  }).eq("id", row.id);
  return json({ success: true, status: "failed", fallback: "unavailable" });
});
