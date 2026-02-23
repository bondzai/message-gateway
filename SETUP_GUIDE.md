# TikTok DM Integration — Setup Guide

Two paths to receive real TikTok DMs in this dashboard:

| Path | Cost | Setup time | Best for |
|---|---|---|---|
| **A: SleekFlow** (third-party) | $299/mo Premium (or trial) | ~30 min | Fast start, managed |
| **B: TikTok Official API** | Free | Longer — needs developer approval | No middleman |

Both require a **TikTok Business Account** (Step 1).

---

## Step 1: TikTok Business Account (both paths)

1. TikTok app → **Profile** → **☰** → **Settings and privacy**
2. **Account** → **Switch to Business Account** → pick any category
3. Go to **Privacy** → **Direct messages** → set to **Everyone**
4. Done — free, instant. Thailand is supported.

---

# Path A: SleekFlow (Recommended for PoC)

SleekFlow is an official TikTok Business Messaging partner in SEA. They handle the TikTok API connection and forward DMs to your webhook.

### A1. Sign up for SleekFlow

1. Go to https://sleekflow.io/ → **Get Started Free**
2. Complete signup
3. You need the **Premium AI** plan ($299/mo) for webhook + API access
   - Ask their sales for a trial/demo if you're evaluating

> Free and Pro plans let you receive TikTok DMs in SleekFlow's own dashboard, but cannot forward to your webhook. Good for validating the TikTok connection works before committing.

### A2. Connect TikTok to SleekFlow

1. SleekFlow left sidebar → **Channels**
2. Select **TikTok Business Messaging**
3. Click **Connect** (top right)
4. Click **Continue on TikTok**
5. Sign in with your TikTok Business Account
6. **Toggle ON all permissions:**
   - Message access
   - Profile information
   - Comment and post management
   - Video analytics
7. Click **Continue**
8. Success notification = connected

> **Regional check:** TikTok Business Messaging is blocked for accounts in US, EU/EEA, Switzerland, UK. Thailand is fine.

### A3. Get SleekFlow API Key (Premium plan required)

1. SleekFlow → **Integrations** (left nav)
2. Under **Direct API** → **Platform API** → **Connect**
3. Copy your API key (looks like `slk_xxxxxxxx`)

### A4. Expose Your Local Server

```bash
# Install ngrok if needed
brew install ngrok

# Start tunnel
ngrok http 3000
```

Copy the HTTPS URL, e.g. `https://abc123.ngrok-free.app`

> Keep this terminal open — ngrok must stay running.

### A5. Create Webhook Flow in SleekFlow

1. SleekFlow → **Flow Builder** → **Create New Flow**
2. Set trigger: **Incoming message received**
   - Filter channel: **TikTok** (so only TikTok DMs forward)
3. Add action node: **Send Triggered Message Webhook**
4. Webhook URL: `https://abc123.ngrok-free.app/webhook/tiktok`
5. (Optional) Add headers for auth if you want
6. **Activate** the flow

Now every TikTok DM will be POSTed to your local server.

### A6. Configure `.env`

```bash
cp .env.example .env
```

Edit `.env`:
```env
PORT=3000
PROVIDER=thirdparty
WEBHOOK_VERIFY_TOKEN=my-secret-token-123
THIRDPARTY_API_KEY=slk_your_api_key_here
THIRDPARTY_API_URL=https://api.sleekflow.io
```

> The exact API base URL may differ — check SleekFlow's API docs at https://apidoc.sleekflow.io/ or their Postman collection.

### A7. Start the Server

```bash
npm start
```

You should see:
```
[HH:MM:SS] INFO  Using provider: thirdparty
[HH:MM:SS] INFO  Server running on http://localhost:3000
[HH:MM:SS] INFO  Webhook URL: /webhook/tiktok
```

### A8. Test the Full Flow

1. Open **http://localhost:3000** in your browser
2. From **a different TikTok account** (or ask a friend), DM your Business Account
3. TikTok delivers the DM to SleekFlow
4. SleekFlow's Flow Builder forwards it to your webhook
5. Message appears in your dashboard
6. Click the conversation → type a reply → SleekFlow relays it back to TikTok

### A9. If SleekFlow's Payload Format Changes

The provider auto-detects SleekFlow's format. SleekFlow's "Send Triggered Message Webhook" sends:

```json
{
  "contact": {
    "id": "ct_789",
    "first_name": "Somchai",
    "last_name": "K."
  },
  "conversation_id": "conv_sf_001",
  "channel": "tiktok",
  "message_content": "Hello!",
  "message_type": "text",
  "message_timestamp": "2026-02-23T10:30:00.000Z"
}
```

If fields don't match, use SleekFlow's **"Preview payload"** button in the webhook node to see the exact format, then adjust `src/providers/ThirdPartyProvider.js` → `_parseSleekFlow()`.

---

# Path B: TikTok Official API

> Use this if you have Developer Portal approval or want zero middleman.
> Blocker: Business Messaging API is beta — may require waitlist.

### B1. Create a TikTok Developer App

1. Go to https://developers.tiktok.com/
2. Sign in → **Manage Apps** → **Connect an app**
3. App name: `Vulcan DM PoC`
4. Under **Add products**, enable **Login Kit** + **Business Messaging**
   - If gated, click **Request Access**
5. Note your **Client Key** and **Client Secret**

### B2. Expose Your Local Server

```bash
ngrok http 3000
```

### B3. Register Webhook

1. TikTok Developer Portal → App settings → **Webhooks**
2. Callback URL: `https://abc123.ngrok-free.app/webhook/tiktok`
3. Verify Token: `my-secret-token-123`
4. Subscribe to: **Direct Message** / `im.message`

### B4. OAuth — Get Access Token

**Auth URL** (open in browser):
```
https://www.tiktok.com/v2/auth/authorize/?client_key=YOUR_KEY&response_type=code&scope=user.info.basic,im.message.read,im.message.write&redirect_uri=https://abc123.ngrok-free.app/auth/callback&state=random123
```

**Grab the code** from ngrok inspector at `http://127.0.0.1:4040`

**Exchange for token:**
```bash
curl -X POST https://open.tiktokapis.com/v2/oauth/token/ \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'client_key=YOUR_KEY&client_secret=YOUR_SECRET&code=THE_CODE&grant_type=authorization_code&redirect_uri=https://abc123.ngrok-free.app/auth/callback'
```

### B5. Configure `.env`

```env
PORT=3000
PROVIDER=official
TIKTOK_CLIENT_KEY=your_client_key
TIKTOK_CLIENT_SECRET=your_client_secret
TIKTOK_ACCESS_TOKEN=act.xxxxxxxxxxxx
TIKTOK_REFRESH_TOKEN=rft.xxxxxxxxxxxx
WEBHOOK_VERIFY_TOKEN=my-secret-token-123
```

### B6. Start & Test

```bash
npm start
```

DM your business account from another TikTok account → appears at `http://localhost:3000`.

---

## View Saved Chats

All messages auto-save to `data/chats.jsonl`:

```bash
# View all chats (one JSON object per line)
cat data/chats.jsonl

# Via API
curl http://localhost:3000/api/chats | jq .
```

---

## Quick Local Test (no TikTok needed)

```bash
# Terminal 1
WEBHOOK_VERIFY_TOKEN=test123 PROVIDER=thirdparty npm start

# Terminal 2 — simulate SleekFlow webhook
curl -X POST http://localhost:3000/webhook/tiktok \
  -H 'Content-Type: application/json' \
  -d @- << 'EOF'
{
  "contact": {"id": "ct_1", "first_name": "Somchai"},
  "conversation_id": "conv_001",
  "channel": "tiktok",
  "message_content": "Hello from TikTok!",
  "message_type": "text",
  "message_timestamp": "2026-02-23T10:00:00Z"
}
EOF
```

Open http://localhost:3000 — message appears.

---

## Constraints (both paths)

- Customer must message your Business Account first
- 48-hour reply window after last customer message
- Max 10 outbound messages per window
- Text + image only (no video/stickers/voice)
- Messages cannot be edited or recalled after sending

---

## Troubleshooting

| Problem | Fix |
|---|---|
| No messages arriving | Check ngrok is running + webhook URL is registered in SleekFlow/TikTok |
| "No API URL" on reply | Set `THIRDPARTY_API_URL` in `.env` |
| SleekFlow webhook fields wrong | Use "Preview payload" in Flow Builder, update `_parseSleekFlow()` |
| 48h window expired | Customer must send a new message to reopen |
| TikTok connection fails | Verify Business Account + DMs set to "Everyone" + region not blocked |
| SleekFlow won't forward | Confirm Premium plan + Flow Builder flow is activated |

---

## Decision Flowchart

```
Need it working today?
├── Yes → Path A (SleekFlow)
│   ├── Budget for $299/mo? → Sign up Premium
│   └── Just validating? → Free tier (DMs in SleekFlow dashboard only)
└── No rush
    └── Path B (TikTok Official API — apply at developers.tiktok.com)
```
