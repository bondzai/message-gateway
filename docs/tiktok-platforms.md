# TikTok Developer Platforms: Which One to Use

> Quick reference for engineers — two separate platforms, different purposes.

---

## The Two Platforms

TikTok has **two completely separate developer platforms** with different accounts, credentials, and APIs.

```
┌─────────────────────────────────┐    ┌─────────────────────────────────┐
│   TikTok for Developers         │    │   TikTok API for Business       │
│   developers.tiktok.com         │    │   business-api.tiktok.com       │
│                                 │    │                                 │
│   "Let users log in with        │    │   "Manage your business on      │
│    TikTok & share content"      │    │    TikTok at scale"             │
│                                 │    │                                 │
│   Products:                     │    │   Products:                     │
│   - Login Kit                   │    │   - Business Messaging API      │
│   - Share Kit                   │    │   - Marketing API (Ads)         │
│   - Content Posting API         │    │   - Audience Management         │
│   - Webhooks (basic events)     │    │   - Reporting & Analytics       │
│   - Data Portability API        │    │   - Automatic Messages          │
│                                 │    │                                 │
│   Use for:                      │    │   Use for:                      │
│   - "Login with TikTok" button  │    │   - Reading/sending DMs         │
│   - Posting videos from app     │    │   - Customer support chat       │
│   - User authentication         │    │   - Ad campaign management      │
│   - Basic account linking       │    │   - Business analytics          │
│                                 │    │                                 │
│   CAN'T do:                     │    │   CAN'T do:                     │
│   - Read/send DMs ✗             │    │   - "Login with TikTok" ✗       │
│   - Manage ads ✗                │    │   - Post videos from app ✗      │
│   - Auto-reply ✗                │    │   - OAuth user login ✗          │
└─────────────────────────────────┘    └─────────────────────────────────┘
```

---

## Side-by-Side Comparison

| | TikTok for Developers | TikTok API for Business |
|---|---|---|
| **URL** | developers.tiktok.com | business-api.tiktok.com |
| **Registration** | Personal or company | Company email required (no Gmail) |
| **Credentials** | Client Key + Client Secret | App ID + App Secret |
| **Sandbox** | Yes (instant, add Target Users) | Yes (after approval) |
| **Review time** | Instant (sandbox) / 1-2 weeks (production) | 3 days to 4 weeks |
| **OAuth** | Yes (Login Kit) | No (uses Business Account auth) |
| **DM access** | No | Yes (Business Messaging API) |
| **Webhook events** | Basic (auth removed, video published) | Messaging events (DM received, read, etc.) |
| **Cost** | Free | Free |
| **Account type needed** | Any TikTok account | TikTok Business Account |

---

## When to Use Which

### Use TikTok for Developers when:
- You want a "Login with TikTok" button on your website
- You need to verify a user's TikTok identity
- You want to post videos to TikTok from your app
- You need basic user profile info (name, avatar)

### Use TikTok API for Business when:
- You want to read and send DMs (direct messages)
- You're building a customer support / chat tool
- You need real-time message webhooks
- You want auto-reply functionality
- You're managing TikTok ads programmatically

### Use BOTH when:
- You need user login (developers.tiktok.com) AND DM management (business-api.tiktok.com)
- This is our case — Login Kit for account linking + Business Messaging API for DMs

---

## Our Project: What We Use

| Feature | Platform | Status |
|---|---|---|
| Account connect (OAuth) | TikTok for Developers | Done |
| Read/send DMs | TikTok API for Business | **Need to register** |
| Webhook (real-time DMs) | TikTok API for Business | **Need to register** |
| Auto-reply | TikTok API for Business | **Need to register** |

---

## How to Register for TikTok API for Business

### Prerequisites
- TikTok Business Account (not personal)
- Company email address (Gmail/Hotmail will be rejected)
- Company information (name, website, industry)

### Steps

1. Go to [business-api.tiktok.com/portal/developer/register](https://business-api.tiktok.com/portal/developer/register)
2. Register with your **company email**
3. Fill in company details
4. Submit application for **Business Messaging API** access
5. Wait for approval

### Approval Timeline

| Stage | Time |
|---|---|
| Registration | Instant |
| Application review | 3 days to 4 weeks |
| Sandbox access | Granted after approval |
| Production access | May require additional review |

### Tips for Faster Approval
- Use a company email with a domain matching your website
- Fill in all company fields completely
- Clearly describe your use case (customer messaging platform)
- Have your website/app live and accessible

---

## Business Messaging API Endpoints (after approval)

### Direct Messages
| Action | Endpoint |
|---|---|
| Send a message | `POST /message/send` |
| List conversations | `GET /conversation/list` |
| List messages | `GET /message/list` |
| Upload image | `POST /image/upload` |
| Download image | `GET /image/download` |
| Enable/disable Comment-to-Message | `POST /comment_to_message/set` |
| Get Comment-to-Message setting | `GET /comment_to_message/get` |

### Webhooks
| Action | Endpoint |
|---|---|
| Create webhook config | `POST /webhook/create` |
| Get webhook config | `GET /webhook/get` |
| Delete webhook config | `DELETE /webhook/delete` |

### Automatic Messages
| Action | Endpoint |
|---|---|
| Create auto-message | `POST /auto_message/create` |
| Update auto-message | `PUT /auto_message/update` |
| Toggle auto-message | `POST /auto_message/toggle` |
| Get auto-message | `GET /auto_message/get` |
| Delete auto-message | `DELETE /auto_message/delete` |
| Sort auto-messages | `POST /auto_message/sort` |

---

## Webhook Signature Verification

TikTok sends a `Tiktok-Signature` header with all webhook events:

```
Tiktok-Signature: t=1633174587,s=18494715036ac4416a1d...
```

Verification steps:
```javascript
// 1. Parse header
const [tPart, sPart] = header.split(',');
const timestamp = tPart.split('=')[1];
const signature = sPart.split('=')[1];

// 2. Build signed payload
const signedPayload = timestamp + '.' + JSON.stringify(requestBody);

// 3. Generate HMAC-SHA256
const expected = crypto
  .createHmac('sha256', CLIENT_SECRET)
  .update(signedPayload)
  .digest('hex');

// 4. Compare
if (expected === signature) {
  // Valid webhook from TikTok
}
```

---

## Migration Plan: Respond.io → Direct TikTok API

```
Current (Phase 1):
  TikTok User → DM → Respond.io → Polling → Our Server
  Cost: $79-249/month

Target (Phase 2):
  TikTok User → DM → TikTok Webhook → Our Server (direct)
  Cost: Free
```

### Steps to Migrate
1. Register at business-api.tiktok.com (do this NOW)
2. Get Business Messaging API approval (wait 3 days - 4 weeks)
3. Build direct integration on new branch (can do while waiting)
4. Test with sandbox
5. Switch `PROVIDER=official` in production
6. Cancel Respond.io subscription

---

## References

- [TikTok for Developers](https://developers.tiktok.com/)
- [TikTok API for Business Portal](https://business-api.tiktok.com/portal)
- [Business Messaging API Education Hub](https://business-api.tiktok.com/portal/bm-api/education-hub)
- [Business Messaging API Docs](https://business-api.tiktok.com/portal/docs?id=1832183871604753)
- [TikTok Webhook Verification](https://developers.tiktok.com/doc/webhooks-verification/)
- [Register for Business API](https://business-api.tiktok.com/portal/developer/register)
