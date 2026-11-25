# Accounts messaging provider setup

The message queue and Edge Functions are deployed. Provider credentials are intentionally not configured, so no external messages are sent yet.

## Supabase Dashboard → Edge Functions → Secrets

Set secrets there only; never put them in frontend code, Postgres rows, or GitHub:

- `WHATSAPP_PHONE_NUMBER_ID`: Meta WhatsApp Cloud API phone-number ID
- `WHATSAPP_ACCESS_TOKEN`: WhatsApp Cloud API access token
- `WHATSAPP_API_VERSION`: optional Graph API version (default `v22.0`)
- `SMS_API_URL`: SMS provider's HTTPS send endpoint
- `SMS_API_TOKEN`: bearer token for that SMS endpoint
- `SMS_SENDER_ID`: optional sender ID
- `MESSAGE_WEBHOOK_SECRET`: random high-entropy webhook secret

SMS endpoint contract: POST JSON `{ "to": "+8801...", "message": "...", "from": "..." }`, bearer authorization, 2xx response with `message_id` or `id`. Select an SMS provider whose API can use this contract or add an adapter in the Edge Function.

## Sending rules

1. WhatsApp is always attempted first when configured.
2. SMS is attempted only when WhatsApp is not configured or its submission fails.
3. Provider acceptance is `awaiting_delivery`, not `delivered`.
4. Final WhatsApp delivery failure triggers SMS fallback when SMS is configured.
5. Only a WhatsApp `read` callback marks a message as read. SMS never receives a read status.

## Delivery webhook adapter

POST to the Supabase `message-status-webhook` function with header `x-message-webhook-secret: <MESSAGE_WEBHOOK_SECRET>` and JSON:

```json
{ "provider_message_id": "provider-message-id", "status": "delivered" }
```

Allowed statuses: `delivered`, `read`, `failed`. Map the provider's webhook callback into this normalized payload. Raw, unsigned provider callbacks must not be forwarded.

## Security and operations

- Message queue rows are institution-scoped by RLS.
- Dispatch uses authenticated Edge Function calls and server-only provider secrets.
- Attempt history stores provider IDs and sanitized error information, not tokens.
- Until at least one provider credential set is saved, the Accounts UI only queues messages; dispatch controls remain unavailable.
- Provider delivery status requires a callback containing the provider message ID.
