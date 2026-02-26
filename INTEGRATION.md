# Integration API Reference

> For dev team | February 2026 | message-gateway

---

## Table of Contents

1. [Architecture](#architecture)
2. [Respond.io API (Current - Working)](#respondio-api)
3. [TikTok Official Business Messaging API (Phase 2)](#tiktok-official-api)
4. [Our Internal API (Dashboard)](#internal-api)
5. [Provider Swap Guide](#provider-swap)

---

## Architecture

```
                        +-----------------------+
                        |   TikTok Platform     |
                        +-----------+-----------+
                                    |
                  +-----------------+-----------------+
                  |                                   |
        [Phase 1: Current]                  [Phase 2: Future]
                  |                                   |
     +------------v-----------+          +------------v-----------+
     |    Respond.io          |          |  TikTok Business API   |
     |    (middleware)        |          |  (direct)              |
     +------------+-----------+          +------------+-----------+
                  |                                   |
                  | REST API polling (1s)              | Webhooks (real-time)
                  |                                   |
     +------------v-------------------------------v---+
     |              Our Server (Node.js)               |
     |   server.js + Provider Layer + EventBus         |
     +-------------------------------------------------+
     |  RespondIOProvider  |  TikTokOfficialProvider   |
     +-------------------------------------------------+
                  |
                  | Socket.IO (real-time)
                  |
     +------------v-----------+
     |   Web Dashboard        |
     |   (browser)            |
     +------------------------+
```

---

## Respond.io API

> **Status:** Working in production
> **Base URL:** `https://api.respond.io/v2`
> **Auth:** Bearer token in header
> **Docs:** No official public API docs (discovered via testing + PHP client)

### Authentication

```http
Authorization: Bearer <API_TOKEN>
Content-Type: application/json
```

Get your token from: Respond.io Dashboard > Settings > Developer API > Generate Token

---

### Endpoints

#### 1. List Contacts

```http
POST /v2/contact/list?limit=50
```

**Request body:**
```json
{
  "search": "",
  "timezone": "Asia/Bangkok",
  "filter": { "$and": [] }
}
```

**Response:**
```json
{
  "items": [
    {
      "id": 398350624,
      "firstName": "jbjbjbxtiktok",
      "lastName": "",
      "profilePic": "https://cdn.chatapi.net/app/contact/avatar/398350624.jpg",
      "channels": [...]
    }
  ]
}
```

**Notes:**
- Filter format uses MongoDB-style `$and` operator
- Returns all contacts across all connected channels (TikTok, WhatsApp, etc.)

---

#### 2. Get Contact Detail

```http
GET /v2/contact/id:<contactId>
```

**Example:**
```
GET /v2/contact/id:398350624
```

**Response:**
```json
{
  "id": 398350624,
  "firstName": "jbjbjbxtiktok",
  "lastName": "",
  "profilePic": "https://cdn.chatapi.net/app/contact/avatar/398350624.jpg",
  "email": null,
  "phone": null,
  "channels": [
    {
      "id": 470953,
      "type": "tiktok",
      "name": "TikTok"
    }
  ]
}
```

**Notes:**
- Contact ID format in URL uses `id:` prefix (not `/contact/398350624`)

---

#### 3. List Messages for a Contact

```http
GET /v2/contact/id:<contactId>/message/list?limit=10
```

**Example:**
```
GET /v2/contact/id:398350624/message/list?limit=10
```

**Response:**
```json
{
  "items": [
    {
      "messageId": 1771832008647092,
      "channelMessageId": "u5Bmp8aqBgpsMO5kHEhd8lj8lw==",
      "contactId": 398350624,
      "channelId": 470953,
      "traffic": "outgoing",
      "message": {
        "type": "text",
        "text": "Hello from our dashboard"
      },
      "sender": {
        "source": "api",
        "userId": null,
        "teamId": null,
        "workflowId": null,
        "broadcastHistoryId": null
      },
      "replyTo": null,
      "status": [
        { "value": "sent", "timestamp": 1771832009571 },
        { "value": "delivered", "timestamp": 1771832013450 },
        { "value": "read", "timestamp": 1771832013450 }
      ]
    },
    {
      "messageId": 1771831909270000,
      "traffic": "incoming",
      "message": {
        "type": "text",
        "text": "Hello from TikTok user"
      },
      "sender": {
        "source": "contact",
        "userId": null
      },
      "status": []
    }
  ]
}
```

**Key fields:**
| Field | Description |
|---|---|
| `messageId` | Unique message ID (also encodes timestamp: `Math.floor(messageId / 1000)` = Unix ms) |
| `traffic` | `"incoming"` (from user) or `"outgoing"` (from us) |
| `message.type` | `"text"`, `"image"`, etc. |
| `message.text` | The message content |
| `sender.source` | `"contact"` (user), `"api"` (our API), `"user"` (Respond.io dashboard) |
| `status` | Delivery status array: `sent` > `delivered` > `read` |

**Notes:**
- Returns newest messages first (reverse chronological)
- Our code reverses the array for chronological display
- `limit` parameter controls how many messages to return

---

#### 4. Send Message

```http
POST /v2/contact/id:<contactId>/message
```

**Request body:**
```json
{
  "message": {
    "type": "text",
    "text": "Hello from our system!"
  }
}
```

**Response:**
```json
{
  "messageId": 1771832008647092,
  "contactId": 398350624
}
```

**Notes:**
- Returns the `messageId` which we track to prevent duplicate display during polling
- Messages sent via API show `sender.source: "api"` in the message list
- TikTok has a 48-hour reply window — can only send if user messaged within last 48h

---

### Respond.io Webhook (Advanced tier only — $279/mo)

If upgraded to Advanced tier, webhooks provide real-time incoming messages instead of polling.

```http
POST https://your-server.com/webhook/tiktok
```

**Payload:**
```json
{
  "data": {
    "contact": {
      "id": 398350624,
      "firstName": "jbjbjbxtiktok",
      "lastName": "",
      "profilePic": "https://..."
    },
    "message": {
      "type": "text",
      "text": "Hello"
    },
    "conversationId": "..."
  }
}
```

---

### Respond.io Rate Limits

| Limit | Value |
|---|---|
| API requests | Not officially documented, estimated ~60 req/min |
| Our polling | 1 request per contact per second |
| Recommendation | Keep contacts < 50 to stay within limits |

---

## TikTok Official API

> **Status:** Phase 2 — ready in codebase, needs TikTok developer approval
> **Base URL:** `https://business-api.tiktok.com/open_api/v1.3/` (Business API) or `https://open.tiktokapis.com/v2/` (Consumer/Login Kit)
> **Auth:** OAuth 2.0 User Access Token
> **Docs:** Gated — full docs available after partner approval

### Important: Access Requirements

| Requirement | Detail |
|---|---|
| Account | TikTok Business Account |
| Region | Available in Thailand (not US/EU/UK) |
| Approval | Must apply as Messaging Partner (3-4 weeks) |
| Apply at | [business-api.tiktok.com](https://business-api.tiktok.com) |

### Important: Messaging Constraints

| Constraint | Detail |
|---|---|
| Who can initiate | User only — business cannot send first message |
| Reply window | 48 hours from user's last message |
| Max messages per window | 10 (before user must respond again) |
| Supported types | Text + Image (image not in all markets) |
| No broadcast | Bulk messaging prohibited |

---

### Authentication — OAuth 2.0

#### Step 1: Authorization URL

Redirect user to:
```
https://www.tiktok.com/v2/auth/authorize/
  ?client_key=<APP_CLIENT_KEY>
  &response_type=code
  &scope=user.info.basic,im.message.read,im.message.write
  &redirect_uri=https://your-server.com/auth/callback
  &state=random_state_string
```

#### Step 2: Exchange Code for Token

```http
POST https://open.tiktokapis.com/v2/oauth/token/
Content-Type: application/x-www-form-urlencoded

client_key=<APP_CLIENT_KEY>
&client_secret=<APP_CLIENT_SECRET>
&code=<AUTH_CODE>
&grant_type=authorization_code
&redirect_uri=https://your-server.com/auth/callback
```

**Response:**
```json
{
  "access_token": "act.xxxxxxxxxxxx",
  "refresh_token": "rft.xxxxxxxxxxxx",
  "expires_in": 86400,
  "open_id": "user_open_id",
  "scope": "user.info.basic,im.message.read,im.message.write"
}
```

#### Step 3: Refresh Token

```http
POST https://open.tiktokapis.com/v2/oauth/token/
Content-Type: application/x-www-form-urlencoded

client_key=<APP_CLIENT_KEY>
&client_secret=<APP_CLIENT_SECRET>
&refresh_token=<REFRESH_TOKEN>
&grant_type=refresh_token
```

| Token | Expiry |
|---|---|
| Access token | 24 hours |
| Refresh token | 365 days |

---

### Endpoints

#### 1. Send Message

```http
POST https://open.tiktokapis.com/v2/im/message/send/
Authorization: Bearer <ACCESS_TOKEN>
Content-Type: application/json
```

**Request body:**
```json
{
  "conversation_id": "string",
  "message": {
    "type": "text",
    "content": "Hello from our system!"
  }
}
```

**Response:**
```json
{
  "data": {
    "message_id": "string"
  },
  "error": {
    "code": "ok",
    "message": ""
  }
}
```

---

#### 2. Get Conversation List (Business API)

```http
GET https://business-api.tiktok.com/open_api/v1.3/customer_service/conversation/list/
Access-Token: <ACCESS_TOKEN>
```

**Query params:**
```
business_id=<string>
page_size=20
cursor=<string>
sort_field=update_time
sort_order=DESC
```

**Response:**
```json
{
  "code": 0,
  "data": {
    "conversations": [
      {
        "conversation_id": "string",
        "user_open_id": "string",
        "last_message": {
          "msg_type": "text",
          "content": "...",
          "create_time": 1700000000
        },
        "unread_count": 0,
        "update_time": 1700000000
      }
    ],
    "has_more": true,
    "cursor": "next_cursor"
  }
}
```

---

#### 3. Get Message History (Business API)

```http
GET https://business-api.tiktok.com/open_api/v1.3/customer_service/message/list/
Access-Token: <ACCESS_TOKEN>
```

**Query params:**
```
business_id=<string>
conversation_id=<string>
page_size=20
cursor=<string>
sort_order=DESC
```

**Response:**
```json
{
  "code": 0,
  "data": {
    "messages": [
      {
        "message_id": "string",
        "conversation_id": "string",
        "from_open_id": "string",
        "msg_type": "text",
        "content": { "text": "Hello" },
        "create_time": 1700000000,
        "direction": "inbound"
      }
    ],
    "has_more": false
  }
}
```

---

#### 4. Upload Image (Business API)

```http
POST https://business-api.tiktok.com/open_api/v1.3/customer_service/image/upload/
Access-Token: <ACCESS_TOKEN>
Content-Type: multipart/form-data

business_id: <string>
image: <binary>
```

**Constraints:** JPEG/WebP, max 20 MB, not available in all regions

---

### Webhooks (Real-time)

Configured in TikTok Developer Portal. Your server must have a public HTTPS endpoint.

#### Webhook Verification

TikTok sends a GET request with `verify_token` and `challenge` params. Return the challenge value:

```http
GET /webhook/tiktok?verify_token=your_secret&challenge=abc123
→ Response: abc123
```

#### Incoming Message Event

```http
POST /webhook/tiktok
X-TT-Webhook-Signature: sha256=<hmac_hex>
Content-Type: application/json
```

**Payload:**
```json
{
  "client_key": "your_app_client_key",
  "event": "direct_message.receive",
  "create_time": 1700000000,
  "user_openid": "open_id_of_sender",
  "content": "{\"message_id\":\"abc\",\"conversation_id\":\"conv123\",\"msg_type\":\"text\",\"content\":{\"text\":\"Hello\"},\"create_time\":1700000000}"
}
```

**Note:** The `content` field is a serialized JSON string — must be parsed separately.

#### Signature Verification

```javascript
const crypto = require('crypto');
const signature = req.headers['x-tt-webhook-signature'];
const expected = 'sha256=' + crypto
  .createHmac('sha256', CLIENT_SECRET)
  .update(rawBody)
  .digest('hex');
if (signature !== expected) return res.status(403).send('Invalid');
```

#### Webhook Event Types

| Event | Trigger |
|---|---|
| `direct_message.receive` | User sends a DM to business |
| `direct_message.read` | User reads business's message |
| `conversation.created` | New conversation initiated |

---

### TikTok Rate Limits

| Limit | Value |
|---|---|
| API requests | 600 req/min per endpoint |
| Rate limit response | HTTP 429 |
| Messages per conversation | 10 per 48-hour window |

---

## Internal API

> Our server endpoints for the dashboard and debugging

### Base URL

| Environment | URL |
|---|---|
| Local | `http://localhost:3000` |
| Production | `https://message-gateway-x7ja.onrender.com` |

### Endpoints

#### GET /health

Health check for Render.

```json
{ "status": "ok" }
```

#### GET /api/status

Debug endpoint showing provider state.

```json
{
  "provider": "respondio",
  "hasApiKey": true,
  "contacts": 3,
  "seenMessages": 22,
  "polling": true,
  "chatLogPath": "/app/data/chats.jsonl",
  "chatLogExists": true,
  "chatCount": 22
}
```

#### GET /api/chats

Returns all saved messages as JSON array.

```json
[
  {
    "type": "dm",
    "direction": "incoming",
    "conversationId": "398350624",
    "timestamp": "2026-02-23T06:17:26.563Z",
    "user": {
      "id": "398350624",
      "username": "jbjbjbxtiktok",
      "nickname": "jbjbjbxtiktok",
      "avatar": "https://..."
    },
    "message": {
      "type": "text",
      "content": "Hello"
    }
  }
]
```

#### Socket.IO Events

| Event | Direction | Payload |
|---|---|---|
| `message` | Server → Client | Same format as `/api/chats` items |
| `send_message` | Client → Server | `{ conversationId: "398350624", text: "Hello" }` |

---

## Provider Swap

### How to switch from Respond.io to TikTok Official API

**Step 1:** Update `.env`:
```bash
# Before (Phase 1)
PROVIDER=respondio
THIRDPARTY_API_KEY=eyJhbG...
THIRDPARTY_API_URL=https://api.respond.io/v2

# After (Phase 2)
PROVIDER=official
TIKTOK_CLIENT_KEY=your_client_key
TIKTOK_CLIENT_SECRET=your_client_secret
TIKTOK_ACCESS_TOKEN=act.xxxxx
TIKTOK_REFRESH_TOKEN=rft.xxxxx
```

**Step 2:** Set up webhook endpoint (public HTTPS required):
```bash
# Render provides this automatically
https://message-gateway-x7ja.onrender.com/webhook/tiktok
```

**Step 3:** Register webhook URL in TikTok Developer Portal

**Step 4:** Restart server — no code changes needed

### Provider Pattern (for adding new providers)

```javascript
// Extend BaseProvider
import { BaseProvider } from './BaseProvider.js';

export class NewProvider extends BaseProvider {
  // Required methods:
  verifyWebhook(req, res) { }     // Handle webhook verification
  handleWebhook(req, res) { }     // Process incoming webhook
  async sendMessage(id, text) { } // Send outgoing message

  // Optional:
  startPolling() { }              // If no webhooks available
  stopPolling() { }               // Cleanup
}
```

Register in `server.js`:
```javascript
function createProvider() {
  switch (config.provider) {
    case 'newprovider': return new NewProvider(bus, config);
    // ...
  }
}
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | Server port (default: 3000, Render sets automatically) |
| `PROVIDER` | Yes | `respondio` or `official` |
| `THIRDPARTY_API_KEY` | If respondio | Respond.io API token |
| `THIRDPARTY_API_URL` | If respondio | `https://api.respond.io/v2` |
| `TIKTOK_CLIENT_KEY` | If official | TikTok app client key |
| `TIKTOK_CLIENT_SECRET` | If official | TikTok app client secret |
| `TIKTOK_ACCESS_TOKEN` | If official | OAuth access token |
| `TIKTOK_REFRESH_TOKEN` | If official | OAuth refresh token |
| `WEBHOOK_VERIFY_TOKEN` | If official | Secret for webhook verification |

---

## Quick Reference

### Respond.io (confirmed working)

| Action | Method | Endpoint |
|---|---|---|
| List contacts | `POST` | `/v2/contact/list?limit=50` |
| Get contact | `GET` | `/v2/contact/id:<id>` |
| List messages | `GET` | `/v2/contact/id:<id>/message/list?limit=10` |
| Send message | `POST` | `/v2/contact/id:<id>/message` |

### TikTok Official (after approval)

| Action | Method | Endpoint |
|---|---|---|
| Send message | `POST` | `https://open.tiktokapis.com/v2/im/message/send/` |
| List conversations | `GET` | `https://business-api.tiktok.com/open_api/v1.3/customer_service/conversation/list/` |
| List messages | `GET` | `https://business-api.tiktok.com/open_api/v1.3/customer_service/message/list/` |
| Upload image | `POST` | `https://business-api.tiktok.com/open_api/v1.3/customer_service/image/upload/` |
| OAuth token | `POST` | `https://open.tiktokapis.com/v2/oauth/token/` |
| Webhook (incoming) | `POST` | `https://your-server/webhook/tiktok` |

---

*message-gateway | github.com/bondzai/message-gateway*
