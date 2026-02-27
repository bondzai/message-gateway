# TikTok PoC — Current Status & Limitations

> Summary for team — what works, what doesn't, and what's next.

---

## What We Built

A TikTok DM dashboard that lets you:
- Connect TikTok Business accounts via OAuth (Login Kit)
- View and reply to DMs in a web dashboard
- Switch between multiple connected accounts

---

## Current Architecture

```
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│  TikTok      │      │  Respond.io  │      │  Our Server  │
│  (DMs)       │─────>│  (3rd party) │─────>│  (Dashboard) │
└──────────────┘      └──────────────┘      └──────────────┘
                             │
                        $79-249/mo
```

Two separate systems are involved:

| System | What it does | Auto-setup? |
|---|---|---|
| **TikTok Login Kit** (developers.tiktok.com) | OAuth login, get username/avatar | Yes — user clicks "Connect" |
| **Respond.io** | Reads/sends TikTok DMs | **No — must add channel manually in Respond.io dashboard** |

---

## Why It Can't Be Fully Automated Right Now

**Login Kit (OAuth) only gives us profile info** — it cannot read or send DMs.

**Respond.io requires manual channel setup** — there is no API to programmatically add a TikTok channel. An admin must:
1. Log into Respond.io dashboard
2. Go to Channels > Add Channel > TikTok
3. Authenticate with TikTok inside Respond.io
4. Our app then polls Respond.io for messages

So the current flow is:
```
User clicks "Connect" in our app  →  gets profile info only (name, avatar)
Admin adds channel in Respond.io  →  gets DM access (manual step)
```

**This means connecting an account in our app does NOT automatically enable messaging.**

---

## How to Fix This: TikTok Business Messaging API

TikTok has a **separate** platform called **TikTok API for Business** (business-api.tiktok.com) that gives **direct DM access** — no Respond.io needed.

```
Target Architecture (no 3rd party):

┌──────────────┐      ┌──────────────┐
│  TikTok      │─────>│  Our Server  │
│  (Webhook)   │      │  (Direct)    │
└──────────────┘      └──────────────┘
                    Cost: Free
```

### What's Needed

| Step | Action | Time |
|---|---|---|
| 1 | Register at business-api.tiktok.com with **company email** (no Gmail) | 10 min |
| 2 | Apply for **Business Messaging API** access | 10 min |
| 3 | Wait for approval | **3 days to 4 weeks** |
| 4 | Build direct integration (webhook + send API) | 2-3 days dev |
| 5 | Cancel Respond.io | After testing |

### Requirements to Register
- TikTok Business Account (not personal)
- Company email (Gmail/Hotmail will be rejected)
- Company info (name, website, industry)
- Registration link: https://business-api.tiktok.com/portal/developer/register

---

## Action Items

1. **Register for TikTok API for Business NOW** — approval takes up to 4 weeks
2. **Keep Respond.io running** as interim solution until Business API is approved
3. **After approval** — build direct TikTok webhook integration, remove Respond.io dependency

---

## Reference Docs

- [TikTok platforms comparison](./tiktok-platforms.md) — detailed breakdown of both platforms
- [OAuth setup guide](./tiktok-oauth-setup.md) — Login Kit configuration pitfalls
- [API reference](./api-reference.md) — our server endpoints and architecture
