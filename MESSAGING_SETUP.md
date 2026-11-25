# SAKM-61 WhatsApp and SMS Setup

## Selected providers and delivery order
1. **Primary:** Meta WhatsApp Business Platform — Cloud API.
2. **Fallback:** eSMS Bangladesh SMS API.

The application attempts WhatsApp first. It does not send SMS after WhatsApp is accepted; it waits for Meta delivery status. A final WhatsApp `failed` status triggers one eSMS fallback attempt. A confirmed WhatsApp `delivered` or `read` status never triggers SMS.

## Supabase Edge Function secrets

Add these under Supabase Dashboard → Edge Functions → Secrets.

| Secret | Required | Purpose |
|---|---:|---|
| `WHATSAPP_PHONE_NUMBER_ID` | Yes | Meta Cloud API phone-number ID used in the Graph API URL |
| `WHATSAPP_ACCESS_TOKEN` | Yes | Permanent System User access token |
| `WHATSAPP_APP_SECRET` | Yes | Meta app secret used to validate `X-Hub-Signature-256` |
| `WHATSAPP_VERIFY_TOKEN` | Yes | Private random string used for Meta's GET webhook challenge |
| `WHATSAPP_TEMPLATE_NAME` | For out-of-session reminders | Approved WhatsApp Utility template name; template must have exactly one body parameter |
| `WHATSAPP_TEMPLATE_LANGUAGE` | Optional | Template language code; defaults to `bn` |
| `WHATSAPP_API_VERSION` | Optional | Graph API version; defaults to `v27.0` |
| `SMS_API_TOKEN` | Yes for fallback | eSMS Bangladesh API token |
| `SMS_SENDER_ID` | Yes for fallback | eSMS-approved sender ID |
| `SMS_API_URL` | Optional | Defaults to `https://login.esms.com.bd/api/v3/sms/send`; only the official eSMS endpoint is accepted |

Never put these values in GitHub source files or send them in chat.

## Meta webhook configuration

- Callback URL: `https://lmwczibsipczfymhyqba.supabase.co/functions/v1/message-status-webhook`
- Verify Token: the exact value stored in `WHATSAPP_VERIFY_TOKEN`
- Subscribe to the WhatsApp Business Account `messages` webhook field.
- The deployed function echoes Meta's `hub.challenge` on a valid GET verification request and verifies POST payloads using the Meta App Secret and `X-Hub-Signature-256`.
- Meta App Secret and Verify Token are different values; do not use the WhatsApp access token for either one.

## WhatsApp template requirement

The function sends a text message if no template name is configured. Text messages may be rejected outside WhatsApp's customer-service window. For scheduled mosque/foundation reminders, create and get approval for a WhatsApp Utility template containing exactly one body placeholder, then set `WHATSAPP_TEMPLATE_NAME` and `WHATSAPP_TEMPLATE_LANGUAGE`. The full reminder text is passed into that single placeholder. The template name and language must exactly match the approved Meta template.

## eSMS request format

The function sends HTTPS form-encoded fields `recipient`, `sender_id`, `type=plain`, and `message`, with `Authorization: Bearer ...` and `Accept: application/json`. The configured URL is restricted to the official eSMS Bangladesh endpoint.

## What is deployed and what still needs provider setup

- `message-dispatch` is deployed and supports WhatsApp-first dispatch, approved-template mode, and eSMS fallback.
- `message-status-webhook` is deployed and supports Meta's native webhook handshake, HMAC signature verification, delivery/read status, and SMS fallback after final WhatsApp failure.
- No external messages are sent until provider secrets are configured.
- A real WhatsApp send/delivery test is still required after Meta credentials, template approval, and webhook subscription.
- eSMS documentation exposes a message-ID status lookup endpoint, but the live response schema has not yet been confirmed. The function does not claim SMS delivery merely because eSMS accepted the send request; SMS remains `awaiting_delivery` until a delivery status is confirmed. A status-polling adapter must be completed after the actual eSMS response format is verified.
- Do not mark the integration fully live until a real WhatsApp-delivered test, WhatsApp-failed-to-eSMS fallback test, and eSMS delivery-status test pass.

## References
- eSMS Bangladesh developer API: https://esms.com.bd/developer-api-documents/
- Meta webhook verification and signature rules: https://developers.facebook.com/docs/graph-api/webhooks/getting-started/
