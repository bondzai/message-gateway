# Multi-Tenant TikTok DM SaaS — Architecture & Scale Analysis

> Vulcan AI | February 2026 | Internal Engineering Document

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Architecture Overview](#architecture-overview)
3. [Multi-Tenant Design](#multi-tenant-design)
4. [Account Setup — Dev vs Business](#account-setup)
5. [OAuth Connect / Disconnect Flow](#oauth-connect--disconnect-flow)
6. [Webhook Routing](#webhook-routing)
7. [Token Management](#token-management)
8. [Database Schema](#database-schema)
9. [AI Agent Worker Design](#ai-agent-worker-design)
10. [Concerns & Limits](#concerns--limits)
11. [Scale Verdict](#scale-verdict)
12. [Tech Stack](#tech-stack)
13. [MVP Phases](#mvp-phases)
14. [Priority Checklist](#priority-checklist)

---

## Problem Statement

We are building an AI-as-a-Service platform. Our customers are business owners who have TikTok Business Accounts. Each customer may have multiple TikTok accounts. The system must:

- Allow customers to plug-in / plug-out TikTok accounts via OAuth
- Run a separate AI agent per account (different prompts, knowledge bases)
- Handle 100+ concurrent DM conversations per account
- Maintain strict tenant isolation (Customer A never sees Customer B's data)
- Scale to hundreds of connected accounts

```
Customer: "ร้านขายของออนไลน์ จำกัด"
  |
  +-- TikTok Account 1: @shopA_official    (ขายเสื้อผ้า)
  +-- TikTok Account 2: @shopA_cosmetics   (ขายเครื่องสำอาง)
  +-- TikTok Account 3: @shopA_shoes       (ขายรองเท้า)
  |
  Each account has 100+ TikTok users DMing daily
  Each account needs its OWN AI agent with different knowledge

Customer 2: "ร้าน B"
  |
  +-- TikTok Account 1: @shopB
  |
  Completely isolated from Customer 1
```

---

## Architecture Overview

```
                    TikTok Users (end consumers)
        User 1   User 2   User 3   ...   User N
          |        |        |               |
          v        v        v               v
    +---------------------------------------------------+
    |              TikTok Platform                       |
    |                                                   |
    |  @shopA_official  @shopA_cosmetics  @shopB        |
    +----------+---------------+-------------+----------+
               |               |             |
               v               v             v
    +---------------------------------------------------+
    |         WEBHOOK GATEWAY (single entry point)       |
    |                                                   |
    |  POST /webhook                                    |
    |                                                   |
    |  1. Verify signature (HMAC-SHA256)                |
    |  2. Parse business_id from payload                |
    |  3. Look up tenant + account in DB                |
    |  4. Push to message queue                         |
    +---------------------------------------------------+
               |
               v
    +---------------------------------------------------+
    |            MESSAGE QUEUE (Redis + BullMQ)          |
    |                                                   |
    |  Queue: tenant:abc:account:shop1 → [msg1, msg2]  |
    |  Queue: tenant:abc:account:shop2 → [msg3]        |
    |  Queue: tenant:xyz:account:shop1 → [msg4, msg5]  |
    +---------------------------------------------------+
               |
               v
    +---------------------------------------------------+
    |            AI AGENT WORKERS                        |
    |                                                   |
    |  Worker picks job from queue:                     |
    |                                                   |
    |  1. Load tenant config (API keys, plan)           |
    |  2. Load account config (AI prompt, knowledge)    |
    |  3. Load conversation session + history           |
    |  4. Call AI (Claude API)                          |
    |  5. Send reply via TikTok API                    |
    |  6. Save to DB                                   |
    |  7. Check: handoff to human needed?              |
    |                                                   |
    |  Worker 1  Worker 2  Worker 3  ...  Worker N     |
    |  (auto-scale based on queue depth)                |
    +---------------------------------------------------+
               |
               v
    +---------------------------------------------------+
    |                  DATABASE                          |
    |                                                   |
    |  tenants, tiktok_accounts, conversations,         |
    |  messages, knowledge_bases, agent_assignments     |
    +---------------------------------------------------+
               |
               v
    +---------------------------------------------------+
    |           CUSTOMER DASHBOARD (SaaS Frontend)       |
    |                                                   |
    |  - Connect/disconnect TikTok accounts             |
    |  - Configure AI prompt per account                |
    |  - Upload knowledge base (PDF/FAQ)                |
    |  - Live conversation monitor                      |
    |  - Human agent takeover                           |
    |  - Analytics                                      |
    +---------------------------------------------------+
```

---

## Multi-Tenant Design

```
CRITICAL: Each tenant's data MUST be isolated

+------------------+-------------------+-------------------+
|    Tenant A      |    Tenant B       |    Tenant C       |
+------------------+-------------------+-------------------+
| @shopA_official  | @shopB            | @shopC_1          |
| @shopA_cosmetics |                   | @shopC_2          |
|                  |                   | @shopC_3          |
+------------------+-------------------+-------------------+
| AI Prompt A      | AI Prompt B       | AI Prompt C       |
| Knowledge A      | Knowledge B       | Knowledge C       |
| Messages A       | Messages B        | Messages C        |
+------------------+-------------------+-------------------+

NEVER cross:
  - Tenant A cannot see Tenant B's messages
  - Tenant A's AI never uses Tenant B's knowledge
  - API keys are encrypted per-tenant
  - DB queries ALWAYS filter by tenant_id

Enforcement:
  - Every DB query: WHERE tenant_id = :currentTenant
  - Row-Level Security (RLS) in PostgreSQL
  - API middleware: extract tenant from JWT, inject into context
  - Queue names: prefixed with tenant ID
```

---

## Account Setup

### Answer: 1 Dev Account, N Business Accounts

```
VULCAN (you) — setup ONCE
======================================

  developers.tiktok.com
         |
         v
  +---------------------------+
  |  1 Developer Account      |
  |  (your company email)     |
  +---------------------------+
         |
         v
  +---------------------------+
  |  1 App Registration       |
  |                           |
  |  App Name: "Vulcan AI"    |
  |  Client Key: awjej88...   |
  |  Client Secret: CkjaL...  |
  |  Redirect URI:            |
  |    https://app.vulcan.ai  |
  |    /auth/callback         |
  |  Scopes requested:        |
  |    im.message.read        |
  |    im.message.write       |
  |    user.info.basic        |
  |  Webhook URL:             |
  |    https://app.vulcan.ai  |
  |    /webhook               |
  +---------------------------+

  This ONE app serves ALL your customers.
  You do NOT create a new app per customer.
```

### What Each Party Does

```
+------------------+--------------------+-----------------------------+
| Who              | Setup              | How Many                    |
+------------------+--------------------+-----------------------------+
| YOU (Vulcan)     | Developer Account  | 1 (one-time)               |
| YOU (Vulcan)     | App Registration   | 1 (one app for all)        |
| YOU (Vulcan)     | Webhook endpoint   | 1 URL (routes internally)  |
| YOUR CUSTOMER    | TikTok Business    | 1+ per customer            |
|                  | Account            | (they already have these)  |
| YOUR CUSTOMER    | OAuth consent      | 1 click per account        |
| YOUR CUSTOMER    | Developer account? | NO — not needed            |
+------------------+--------------------+-----------------------------+
```

---

## OAuth Connect / Disconnect Flow

### Plug-In: Customer Connects a TikTok Account

```
Step 1: Customer clicks [+ Connect New Account] in dashboard
         |
         v
Step 2: Redirect to TikTok OAuth
        https://www.tiktok.com/v2/auth/authorize/
          ?client_key=OUR_APP_KEY
          &redirect_uri=https://app.vulcan.ai/auth/callback
          &state=tenant:abc123
          &scope=im.message.read,im.message.write
         |
         v
Step 3: Customer authorizes on TikTok
        "Vulcan AI wants to read/send your messages"
        [Authorize]  [Cancel]
         |
         v
Step 4: Callback receives tokens
        GET /auth/callback?code=xxx&state=tenant:abc123
         |
         v
Step 5: Server exchanges code for tokens and stores in DB
        INSERT INTO tiktok_accounts (
          tenant_id: "abc123",
          access_token: encrypt(token),
          refresh_token: encrypt(refresh),
          account_name: "@shopA_new",
          status: "active"
        )
         |
         v
Step 6: Register webhook for this account
         |
         v
Step 7: Account is LIVE — AI starts handling DMs
```

### Plug-Out: Customer Disconnects an Account

```
Step 1: Customer clicks [Disconnect] on @shopA_shoes
         |
         v
Step 2: UPDATE tiktok_accounts SET status = 'disconnected'
         |
         v
Step 3: Revoke TikTok OAuth token
         |
         v
Step 4: Workers skip jobs for disconnected accounts
         |
         v
Step 5: Data retained for 30 days, then purged
```

---

## Webhook Routing

```
1 webhook URL receives events for ALL connected accounts.
Each event includes business_id to identify the account.

  POST /webhook
  {
    "client_key": "your_app_key",
    "event": "direct_message.receive",
    "user_openid": "user_abc",
    "content": "{
      \"business_id\": \"7281937...\",
      \"message_id\": \"msg_123\",
      \"conversation_id\": \"conv_456\",
      \"msg_type\": \"text\",
      \"content\": { \"text\": \"สวัสดีค่ะ\" }
    }"
  }

Your server:
  1. Verify HMAC-SHA256 signature
  2. Parse business_id from payload
  3. Look up in DB → find tenant + account
  4. Push to queue: tenant:abc:account:shop1
  5. Worker processes with correct AI prompt + token
  6. Reply using THAT account's access_token
```

---

## Token Management

```
Each connected account has its own token pair.

+-----------------------------------------------------------+
|  tiktok_accounts table                                    |
+-----------------------------------------------------------+
| tenant    | account          | access_token  | expires_at  |
|-----------|------------------|---------------|-------------|
| abc123    | @shopA_fashion   | act.aaa...    | 24h         |
| abc123    | @shopA_beauty    | act.bbb...    | 24h         |
| abc123    | @shopA_food      | act.ccc...    | 24h         |
| xyz789    | @shopB           | act.ddd...    | 24h         |
+-----------------------------------------------------------+

Token refresh cron job (runs every 6 hours):
  for each account where expires_at < now + 6h:
    POST TikTok refresh endpoint
    UPDATE tiktok_accounts SET access_token = new_token

If refresh fails (customer revoked access):
  UPDATE tiktok_accounts SET status = 'expired'
  Notify customer: "Please reconnect @shopA_fashion"

Token lifecycle concerns:
  - Customer changes TikTok password → all tokens revoked
  - Customer removes app from TikTok → token revoked silently
  - TikTok changes OAuth scopes → customers must re-authorize
  - Refresh job fails → token expires → account offline
```

---

## Database Schema

```sql
-- Tenants (your customers)
tenants
  id              UUID PRIMARY KEY
  name            VARCHAR(255)
  email           VARCHAR(255) UNIQUE
  plan            ENUM('free', 'growth', 'enterprise')
  api_quota       INTEGER
  created_at      TIMESTAMP

-- Connected TikTok accounts
tiktok_accounts
  id              UUID PRIMARY KEY
  tenant_id       UUID REFERENCES tenants(id)
  tiktok_business_id  VARCHAR(255)
  account_name    VARCHAR(255)
  access_token    TEXT (encrypted AES-256-GCM)
  refresh_token   TEXT (encrypted AES-256-GCM)
  token_expires_at    TIMESTAMP
  ai_system_prompt    TEXT
  ai_knowledge_base_id UUID
  webhook_secret  VARCHAR(255)
  status          ENUM('active', 'paused', 'expired', 'disconnected')
  connected_at    TIMESTAMP

-- Conversations (1 per TikTok user per account)
conversations
  id              UUID PRIMARY KEY
  account_id      UUID REFERENCES tiktok_accounts(id)
  tenant_id       UUID REFERENCES tenants(id)
  tiktok_user_id  VARCHAR(255)
  tiktok_username VARCHAR(255)
  status          ENUM('active', 'resolved', 'expired')
  mode            ENUM('ai', 'human', 'paused')
  assigned_agent_id   UUID
  created_at      TIMESTAMP
  last_message_at TIMESTAMP

-- Messages
messages
  id              UUID PRIMARY KEY
  conversation_id UUID REFERENCES conversations(id)
  tenant_id       UUID REFERENCES tenants(id)
  direction       ENUM('incoming', 'outgoing')
  content         TEXT
  sender_type     ENUM('user', 'ai', 'human')
  tiktok_message_id   VARCHAR(255)
  ai_model_used   VARCHAR(50)
  ai_confidence   FLOAT
  ai_tokens_used  INTEGER
  created_at      TIMESTAMP

-- Knowledge bases
knowledge_bases
  id              UUID PRIMARY KEY
  account_id      UUID REFERENCES tiktok_accounts(id)
  tenant_id       UUID REFERENCES tenants(id)
  name            VARCHAR(255)
  type            ENUM('faq', 'pdf', 'url')
  content         TEXT
  embedding_id    VARCHAR(255)
  created_at      TIMESTAMP

-- RLS: Every table has tenant_id, enforce at DB level
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON conversations
  USING (tenant_id = current_setting('app.current_tenant')::UUID);
```

---

## AI Agent Worker Design

```
Message Queue (BullMQ)
         |
         v
+-----------------------------------------------+
|  Worker Process                                |
|                                               |
|  1. Dequeue message                           |
|     { tenant_id, account_id, conversation_id, |
|       user_msg, tiktok_user_id }              |
|                                               |
|  2. Load context                              |
|     - tenant plan + quota                     |
|     - account AI prompt                       |
|     - knowledge base (RAG search)             |
|     - conversation history (last 10 msgs)     |
|                                               |
|  3. Select AI model                           |
|     - Simple Q&A → Haiku ($0.004/msg)         |
|     - Complex → Sonnet ($0.015/msg)           |
|     - Routing: classify intent first          |
|                                               |
|  4. Call Claude API                           |
|     {                                         |
|       model: "claude-haiku-4-5",              |
|       system: account.ai_system_prompt,       |
|       messages: [                             |
|         ...conversation_history,              |
|         { role: "user", content: user_msg }   |
|       ]                                       |
|     }                                         |
|                                               |
|  5. Evaluate response                         |
|     - confidence < threshold? → handoff       |
|     - contains "ติดต่อเจ้าหน้าที่"? → handoff  |
|     - 3 failed attempts? → handoff            |
|                                               |
|  6. Send reply                                |
|     POST TikTok API /im/message/send/         |
|     Authorization: Bearer account.access_token|
|                                               |
|  7. Save to DB                                |
|     INSERT messages (content, ai_tokens_used, |
|       ai_confidence, sender_type: 'ai')       |
|                                               |
|  8. Update usage                              |
|     tenant.messages_this_month += 1           |
|     tenant.ai_tokens_this_month += tokens     |
+-----------------------------------------------+
```

---

## Concerns & Limits

### 1. TikTok API Rate Limits

```
48-hour window rule:
  - User must send first message (business cannot initiate)
  - Business can reply up to 10 messages per 48h window
  - Window resets when user sends a new message
  - After 48h silence from user → window CLOSED

Rate limits:
  - 600 requests/min per endpoint (shared across your entire app)
  - At 1000+ accounts, you WILL hit this limit
  - Request increase from TikTok (available for approved partners)

Scale concern: HIGH
```

### 2. OAuth Token Management

```
Access Token: expires in 24 hours
Refresh Token: expires in 365 days

Failure scenarios:
  - Customer changes TikTok password → all tokens revoked
  - Customer removes app → token revoked silently (401 on next call)
  - TikTok changes scopes → all customers must re-authorize
  - Refresh cron fails → token expires → account offline

500 accounts = 500 tokens refreshing every 24h = ~21 refresh calls/hour

Scale concern: MEDIUM
Mitigation: Cron every 6h, retry with backoff, alert on failure
```

### 3. AI Cost (Biggest Operational Cost)

```
Cost per message:
+----------------------------------+-----------+
| Component                        | Tokens    |
+----------------------------------+-----------+
| System prompt                    | ~500      |
| Knowledge base context (RAG)     | ~2,000    |
| Conversation history (last 10)   | ~1,500    |
| User message                     | ~50       |
| AI reply                         | ~200      |
+----------------------------------+-----------+
| TOTAL per message                | ~4,250    |
+----------------------------------+-----------+

Cost per message:
  Haiku:  $0.004/message
  Sonnet: $0.015/message

Monthly projection:
+----------+----------+--------------+--------------+
| Accounts | Msgs/day | Haiku/month  | Sonnet/month |
+----------+----------+--------------+--------------+
| 10       | 500      | $60          | $225         |
| 50       | 2,500    | $300         | $1,125       |
| 100      | 5,000    | $600         | $2,250       |
| 500      | 25,000   | $3,000      | $11,250      |
| 1,000    | 50,000   | $6,000      | $22,500      |
+----------+----------+--------------+--------------+

Scale concern: HIGH
Mitigation: Use Haiku for 80% of messages, Sonnet for complex only,
            cache FAQ answers, pass cost to customers in pricing
```

### 4. Database Growth

```
Growth rate:
  100 accounts x 50 msgs/day x 365 days = 1.8M rows/year
  500 accounts x 50 msgs/day x 365 days = 9.1M rows/year

PostgreSQL handles this easily (comfortable up to ~100M rows).

When to worry:
  - 1,000+ accounts: add read replicas
  - 10,000+ accounts: partition by tenant_id
  - 100,000+ accounts: shard database

Scale concern: LOW
```

### 5. Webhook Reliability

```
If your server is DOWN, TikTok retries for up to 72 hours.
After 72 hours: messages DROPPED permanently.

Every minute of downtime at 500 accounts = ~1,500 lost messages.

Scale concern: HIGH
Mitigation: Multi-region deployment, health checks, auto-restart,
            queue webhooks immediately (process async),
            fallback poll API for missed messages
```

### 6. Multi-Tenant Security

```
Risks:
  1. Tenant data leak → RLS in PostgreSQL, filter by tenant_id
  2. Token theft → Encrypt at rest (AES-256-GCM) + KMS
  3. Webhook spoofing → Always verify HMAC-SHA256 signature
  4. AI prompt injection → Sanitize input, never cross-tenant context

Scale concern: CRITICAL (not scale, but risk)
```

### 7. TikTok Platform Risk

```
Risks:
  1. TikTok changes/removes Business Messaging API (still Beta)
  2. TikTok bans in certain countries (Thailand safe for now)
  3. API versioning breaks integration (6-12 month deprecation)
  4. App review rejection → ALL customers disconnected

Scale concern: MEDIUM
Mitigation: Multi-channel from day 1 (TikTok + LINE + WhatsApp),
            provider-pattern architecture (already built)
```

---

## Scale Verdict

```
+---------------------------------------------------------------+
| Phase         | Accounts  | Verdict      | Blocker            |
+---------------+-----------+--------------+--------------------+
| MVP           | 1-10      | Easy         | None               |
| Early         | 10-50     | Fine         | AI cost            |
| Growth        | 50-200    | Doable       | Rate limits        |
| Scale         | 200-1,000 | Careful      | Rate limits +      |
|               |           |              | infra + cost       |
| Enterprise    | 1,000+    | Hard         | TikTok partnership |
|               |           |              | + dedicated infra  |
+---------------+-----------+--------------+--------------------+

YES it scales to ~200 accounts with standard architecture.
Beyond 200: need TikTok partnership (higher rate limits)
and dedicated infrastructure.

The REAL limits are not technical — they are:
  1. TikTok API rate limits (request increase from TikTok)
  2. AI cost (pass to customers via pricing)
  3. Uptime requirement (multi-region deployment)
```

---

## Tech Stack

```
+-------------------+-------------------------+----------------------+
| Layer             | Technology              | Why                  |
+-------------------+-------------------------+----------------------+
| Frontend          | Next.js + Tailwind      | Dashboard SaaS UI    |
| Auth              | Clerk or NextAuth       | Multi-tenant auth    |
| API               | Node.js + Fastify       | Current stack, fast  |
| AI                | Claude API (Anthropic)  | Best reasoning       |
| Queue             | BullMQ + Redis          | Per-tenant queues    |
| Database          | PostgreSQL + Prisma     | RLS, migrations      |
| Token encryption  | AES-256-GCM            | Encrypt OAuth tokens |
| File storage      | S3 / Cloudflare R2     | Knowledge base docs  |
| Hosting           | Railway / AWS ECS       | Auto-scale workers   |
| Monitoring        | Sentry + Grafana        | Error + metrics      |
+-------------------+-------------------------+----------------------+
```

---

## MVP Phases

```
Phase 1 (Week 1-2): Core
  [x] Message Gateway with provider pattern (done — current PoC)
  [ ] Multi-tenant DB schema (PostgreSQL + Prisma)
  [ ] OAuth connect/disconnect flow (multi-account)
  [ ] Tenant dashboard (list accounts, see messages)

Phase 2 (Week 3-4): AI
  [ ] AI agent with per-account system prompt
  [ ] Conversation session management (Redis)
  [ ] Basic handoff to human agent
  [ ] Model routing (Haiku for simple, Sonnet for complex)

Phase 3 (Week 5-6): SaaS
  [ ] Customer signup/login (Clerk)
  [ ] Billing integration (Stripe)
  [ ] Usage tracking + quota enforcement
  [ ] Knowledge base upload (PDF/FAQ → embeddings)

Phase 4 (Week 7-8): Production
  [ ] Analytics dashboard
  [ ] Multi-agent assignment + queue
  [ ] Notification system (LINE Notify / email)
  [ ] Rate limiting + abuse protection
  [ ] Multi-region deployment
  [ ] Penetration testing
```

---

## Priority Checklist

```
Must have (before launch):
  [1] Token encryption (AES-256-GCM)
  [2] Row-Level Security in PostgreSQL
  [3] Webhook signature verification (HMAC-SHA256)
  [4] Token refresh cron job
  [5] Error alerting (Sentry / PagerDuty)

Should have (before scale):
  [6] Rate limit handling (429 retry with backoff)
  [7] Message queue (BullMQ + Redis)
  [8] AI model routing (Haiku / Sonnet)
  [9] Usage tracking per tenant

Nice to have (for enterprise):
  [10] Multi-region deployment
  [11] FAQ cache (skip AI for common questions)
  [12] Multi-channel support (LINE, WhatsApp)
```

---

## Billing Model

```
+------------+----------+------------+-------------+
|            | Free     | Growth     | Enterprise  |
+------------+----------+------------+-------------+
| Accounts   | 1        | 5          | Unlimited   |
| Messages   | 500/mo   | 10,000/mo  | Unlimited   |
| AI replies | 100/mo   | 5,000/mo   | Unlimited   |
| Knowledge  | 1 FAQ    | 10 docs    | Unlimited   |
| Human seats| 1        | 5          | Unlimited   |
| Analytics  | Basic    | Full       | Full + API  |
| Price      | Free     | ฿1,500/mo  | Custom      |
+------------+----------+------------+-------------+
```

---

*Vulcan AI — Multi-Tenant TikTok DM SaaS Platform*
*github.com/bondzai/message-gateway*
