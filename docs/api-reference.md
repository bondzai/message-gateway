# API Reference

> For dev team | February 2026 | message-gateway

## Quick Start

```bash
cp .env.example .env   # edit with your credentials
make install
make dev               # http://localhost:3000
```

---

## Current Architecture (Phase 1)

We use **two separate services** because TikTok's DM API requires a special partnership we don't have yet.

```
                    ┌──────────────────────────────────────────┐
                    │            TikTok Platform                │
                    └──────┬──────────────────┬────────────────┘
                           │                  │
                    DM messages         User identity
                           │                  │
                           ▼                  ▼
                    ┌──────────────┐   ┌──────────────────┐
                    │  Respond.io  │   │ TikTok Login Kit │
                    │  (3rd party) │   │ (developers.      │
                    │              │   │  tiktok.com)      │
                    └──────┬───────┘   └────────┬─────────┘
                           │                    │
                    polling (1s)          OAuth callback
                           │                    │
                           ▼                    ▼
                    ┌──────────────────────────────────────┐
                    │         Our Server (Express)         │
                    │                                      │
                    │  RespondIOProvider    authRoutes.js   │
                    │  (read/send DMs)     (connect account)│
                    └──────────────┬───────────────────────┘
                                   │
                            Socket.IO
                                   │
                                   ▼
                    ┌──────────────────────────────────────┐
                    │        Web Dashboard (browser)       │
                    │                                      │
                    │  index.html          accounts.html   │
                    │  (chat view)        (manage accounts) │
                    └──────────────────────────────────────┘
```

### Why Two Services?

| Service | What it does | Why we need it |
|---|---|---|
| **Respond.io** | Reads and sends TikTok DMs | TikTok's direct DM API (Business Messaging API) requires partner approval we don't have yet |
| **TikTok Login Kit** | "Connect TikTok Account" button — verifies user identity | Lets users link their TikTok account to our dashboard |

### What Each Service Handles

| Feature | Handled by | Platform |
|---|---|---|
| Read incoming DMs | Respond.io | respond.io |
| Send reply DMs | Respond.io | respond.io |
| "Connect Account" button | TikTok Login Kit | developers.tiktok.com |
| Show user profile (name, avatar) | TikTok Login Kit | developers.tiktok.com |
| Disconnect account | Our server | local |

### Demo Flow (for stakeholders)

1. User opens **Accounts page** → clicks **"Connect TikTok Account"**
2. Redirected to TikTok → grants permission → redirected back *(Login Kit)*
3. Account appears with name and avatar
4. User opens **Dashboard** → sees live DM conversations *(Respond.io)*
5. User clicks a conversation → types a reply → message sent *(Respond.io)*

---

## Future Architecture (Phase 2 — after Business API approval)

```
                    ┌──────────────────────────────────────────┐
                    │            TikTok Platform                │
                    └──────────────────┬───────────────────────┘
                                       │
                              Webhooks (real-time)
                              + Direct API calls
                                       │
                                       ▼
                    ┌──────────────────────────────────────┐
                    │         Our Server (Express)         │
                    │                                      │
                    │  TikTokOfficialProvider               │
                    │  (read/send DMs directly)            │
                    └──────────────┬───────────────────────┘
                                   │
                            Socket.IO
                                   │
                                   ▼
                    ┌──────────────────────────────────────┐
                    │        Web Dashboard (browser)       │
                    └──────────────────────────────────────┘
```

**What changes:** Respond.io is removed. DMs go directly through TikTok's Business Messaging API. No 3rd party cost, real-time webhooks instead of polling.

**What's needed:** Register at [business-api.tiktok.com](https://business-api.tiktok.com/portal/developer/register) and get approved for Business Messaging API. See [tiktok-platforms.md](./tiktok-platforms.md) for details.

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

## TikTok Login Kit (Account Linking)

> **Platform:** developers.tiktok.com
> **Purpose:** Connect/disconnect TikTok accounts (identity only, not DMs)
> **Auth:** OAuth 2.0 (Web — no PKCE)
> **Full setup guide:** [tiktok-oauth-setup.md](./tiktok-oauth-setup.md)

### OAuth Flow

**Step 1:** Redirect to TikTok (our `/auth/connect` does this):
```
https://www.tiktok.com/v2/auth/authorize/
  ?client_key=<KEY>
  &response_type=code
  &scope=user.info.basic
  &redirect_uri=<CALLBACK>
  &state=<RANDOM>
```

> **Note:** No PKCE (code_challenge) for Web apps. PKCE is Desktop-only.

**Step 2:** Exchange code for tokens:
```http
POST https://open.tiktokapis.com/v2/oauth/token/
Content-Type: application/x-www-form-urlencoded

client_key=<KEY>&client_secret=<SECRET>&code=<CODE>
&grant_type=authorization_code&redirect_uri=<URI>
```

| Token | Expiry |
|---|---|
| Access token | 24 hours |
| Refresh token | 365 days |

---

## TikTok Business Messaging API (Phase 2 — Not Yet Available)

> **Platform:** business-api.tiktok.com (separate from developers.tiktok.com)
> **Status:** Need to register and get approved
> **Details:** [tiktok-platforms.md](./tiktok-platforms.md)

### Endpoints (after approval)

| Action | Method | Endpoint |
|---|---|---|
| Send message | `POST` | `/message/send` |
| List conversations | `GET` | `/conversation/list` |
| List messages | `GET` | `/message/list` |
| Upload image | `POST` | `/image/upload` |
| Create webhook | `POST` | `/webhook/create` |

### Messaging Constraints

- User must message first (business cannot initiate)
- 48-hour reply window from last user message
- Max 10 outbound messages per window
- Text + image only

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
# Phase 1 (current) — DMs via Respond.io
PROVIDER=respondio

# Phase 2 (future) — DMs directly via TikTok
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
| `TIKTOK_CLIENT_KEY` | For account linking | TikTok Login Kit client key (from Sandbox tab) |
| `TIKTOK_CLIENT_SECRET` | For account linking | TikTok Login Kit client secret (from Sandbox tab) |
| `WEBHOOK_VERIFY_TOKEN` | If official | Webhook verification secret |

---

## Local Testing (no TikTok needed)

```bash
# Terminal 1 — start server
make dev

# Terminal 2 — simulate incoming message
curl -X POST http://localhost:3000/webhook/tiktok \
  -H 'Content-Type: application/json' \
  -d '{"contact":{"id":"1","first_name":"Test"},"conversation_id":"conv_1","message_content":"Hello!","message_type":"text","message_timestamp":"2026-02-27T10:00:00Z"}'
```

Open http://localhost:3000 — message appears.

## Troubleshooting

| Problem | Fix |
|---|---|
| No messages arriving | Check Respond.io API token in `.env` |
| "No API URL" on reply | Set `THIRDPARTY_API_URL` in `.env` |
| TikTok OAuth fails | See [tiktok-oauth-setup.md](./tiktok-oauth-setup.md) |
| Messages duplicated | Check `seenMessageIds` in `/api/status` |
| Account connect works in incognito only | Clear TikTok site data in browser, see [tiktok-oauth-setup.md](./tiktok-oauth-setup.md#browser-caching-issues) |

## Related Docs

- [TikTok OAuth Setup Guide](./tiktok-oauth-setup.md) — step-by-step Login Kit setup, common errors
- [TikTok Platforms Comparison](./tiktok-platforms.md) — developers.tiktok.com vs business-api.tiktok.com
- [Architecture](./architecture.md) — multi-tenant SaaS design
- [Cost Comparison](./cost-comparison.md) — Respond.io vs direct API costs
