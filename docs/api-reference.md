# API Reference

> For dev team | February 2026 | message-gateway

## Quick Start

```bash
cp .env.example .env   # edit with your credentials
make install
make dev               # http://localhost:3000
```

## Data Flow

```
TikTok Platform
       |
       v
Respond.io (Phase 1)  or  TikTok API (Phase 2)
       |                        |
       | polling (1s)           | webhooks
       v                        v
Our Server (Node.js + Express + EventBus)
       |
       | Socket.IO
       v
Web Dashboard (browser)
```

---

## Respond.io API (Phase 1 — Current)

> **Base URL:** `https://api.respond.io/v2`
> **Auth:** `Authorization: Bearer <API_TOKEN>`

### Endpoints

| Action | Method | Endpoint |
|---|---|---|
| List contacts | `POST` | `/v2/contact/list?limit=50` |
| Get contact | `GET` | `/v2/contact/id:<id>` |
| List messages | `GET` | `/v2/contact/id:<id>/message/list?limit=10` |
| Send message | `POST` | `/v2/contact/id:<id>/message` |

### List Contacts

```http
POST /v2/contact/list?limit=50

{ "search": "", "timezone": "Asia/Bangkok", "filter": { "$and": [] } }
```

### List Messages

```http
GET /v2/contact/id:398350624/message/list?limit=10
```

Returns newest-first. Key fields:

| Field | Description |
|---|---|
| `messageId` | Unique ID (encodes timestamp: `Math.floor(messageId / 1000)` = Unix ms) |
| `traffic` | `"incoming"` or `"outgoing"` |
| `message.text` | Message content |
| `sender.source` | `"contact"` (user), `"api"` (our API), `"user"` (dashboard) |

### Send Message

```http
POST /v2/contact/id:398350624/message

{ "message": { "type": "text", "text": "Hello!" } }
```

Returns `{ messageId, contactId }` — we track `messageId` to prevent polling duplicates.

### Rate Limits

~60 req/min (estimated). Our polling: 1 request per contact per second. Keep contacts < 50.

---

## TikTok Official API (Phase 2)

> **Status:** Ready in codebase, needs TikTok developer approval
> **Auth:** OAuth 2.0 with PKCE

### Requirements

| Requirement | Detail |
|---|---|
| Account | TikTok Business Account |
| Region | Thailand (not US/EU/UK) |
| Approval | 3–4 weeks as Messaging Partner |

### Messaging Constraints

- User must message first (business cannot initiate)
- 48-hour reply window from last user message
- Max 10 outbound messages per window
- Text + image only

### OAuth Flow

**Step 1:** Redirect to TikTok (our `/auth/connect` does this):
```
https://www.tiktok.com/v2/auth/authorize/
  ?client_key=<KEY>
  &response_type=code
  &scope=user.info.basic
  &redirect_uri=<CALLBACK>
  &state=<RANDOM>
  &code_challenge=<BASE64URL_SHA256>
  &code_challenge_method=S256
```

**Step 2:** Exchange code for tokens:
```http
POST https://open.tiktokapis.com/v2/oauth/token/
Content-Type: application/x-www-form-urlencoded

client_key=<KEY>&client_secret=<SECRET>&code=<CODE>
&grant_type=authorization_code&redirect_uri=<URI>
&code_verifier=<VERIFIER>
```

| Token | Expiry |
|---|---|
| Access token | 24 hours |
| Refresh token | 365 days |

### Endpoints

| Action | Method | Endpoint |
|---|---|---|
| Send message | `POST` | `https://open.tiktokapis.com/v2/im/message/send/` |
| List conversations | `GET` | `https://business-api.tiktok.com/.../conversation/list/` |
| List messages | `GET` | `https://business-api.tiktok.com/.../message/list/` |
| OAuth token | `POST` | `https://open.tiktokapis.com/v2/oauth/token/` |
| Revoke token | `POST` | `https://open.tiktokapis.com/v2/oauth/revoke/` |

### Webhooks

Register in TikTok Developer Portal. Verification:

```http
GET /webhook/tiktok?verify_token=<SECRET>&challenge=abc123
→ Response: abc123
```

Incoming message event:
```http
POST /webhook/tiktok
X-TT-Webhook-Signature: sha256=<hmac_hex>
```

Verify with:
```javascript
const expected = 'sha256=' + crypto
  .createHmac('sha256', CLIENT_SECRET)
  .update(rawBody).digest('hex');
```

Rate limit: 600 req/min per endpoint.

---

## Internal API (Dashboard)

| Environment | URL |
|---|---|
| Local | `http://localhost:3000` |
| Production | `https://message-gateway-x7ja.onrender.com` |

### REST Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Health check (`{ "status": "ok" }`) |
| `GET` | `/api/status` | Provider debug info |
| `GET` | `/api/chats` | All saved messages (JSON array) |
| `GET` | `/api/accounts` | Connected accounts (tokens stripped) |
| `DELETE` | `/api/accounts/:id` | Disconnect + revoke token |
| `GET` | `/auth/connect` | Start TikTok OAuth |
| `GET` | `/auth/callback` | OAuth callback (exchanges code) |

### Socket.IO Events

| Event | Direction | Payload |
|---|---|---|
| `message` | Server → Client | `{ type, direction, conversationId, timestamp, user, message }` |
| `send_message` | Client → Server | `{ conversationId, text }` |

---

## Provider Swap

Change one env var to switch providers:

```bash
# Phase 1 (current)
PROVIDER=respondio

# Phase 2
PROVIDER=official
```

No code changes needed. Add new providers by extending `BaseProvider`:

```javascript
import { BaseProvider } from './BaseProvider.js';

export class NewProvider extends BaseProvider {
  verifyWebhook(req, res) { }
  handleWebhook(req, res) { }
  async sendMessage(id, text) { }
  startPolling() { }  // optional
}
```

Register in `src/providers/providerFactory.js`.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | Server port (default: 3000) |
| `PROVIDER` | Yes | `respondio`, `thirdparty`, or `official` |
| `THIRDPARTY_API_KEY` | If respondio | Respond.io API token |
| `THIRDPARTY_API_URL` | If respondio | `https://api.respond.io/v2` |
| `TIKTOK_CLIENT_KEY` | If official | TikTok app client key |
| `TIKTOK_CLIENT_SECRET` | If official | TikTok app client secret |
| `TIKTOK_ACCESS_TOKEN` | If official | OAuth access token |
| `TIKTOK_REFRESH_TOKEN` | If official | OAuth refresh token |
| `WEBHOOK_VERIFY_TOKEN` | If official | Webhook verification secret |

---

## Local Testing (no TikTok needed)

```bash
# Terminal 1 — start server
make dev

# Terminal 2 — simulate webhook
curl -X POST http://localhost:3000/webhook/tiktok \
  -H 'Content-Type: application/json' \
  -d '{"contact":{"id":"1","first_name":"Test"},"conversation_id":"conv_1","message_content":"Hello!","message_type":"text","message_timestamp":"2026-02-27T10:00:00Z"}'
```

Open http://localhost:3000 — message appears.

## Troubleshooting

| Problem | Fix |
|---|---|
| No messages arriving | Check webhook URL registered + ngrok running |
| "No API URL" on reply | Set `THIRDPARTY_API_URL` in `.env` |
| 48h window expired | Customer must send a new message |
| TikTok OAuth fails | Verify redirect URI registered in Developer Portal |
| Messages duplicated | Check `seenMessageIds` in `/api/status` |
