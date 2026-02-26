# TikTok DM Integration — Comparison & Recommendation

> Vulcan PoC | February 2026 | Region: Thailand (Asia-Pacific — all options available)

---

## One-Page Comparison

| | TikTok Direct API | Respond.io | Manychat | SleekFlow | Hybrid (Recommended) |
|---|---|---|---|---|---|
| **Monthly Cost** | Free | $159–279/mo | $15–100/mo | $299/mo | $159 → Free |
| **Year 1 Cost** | ~$0 + hosting | $1,749–3,069 | $180–1,200 | $3,588 | ~$500–800 |
| **Setup Time** | 1–2 weeks | Done (PoC live) | 1–2 days | 1–2 days | Done (PoC live) |
| **TikTok DM** | Yes | Yes | Yes (Beta) | Yes | Yes |
| **API Access** | Yes (it IS the API) | Growth+ ($159) | Pro+ ($15) | Premium ($299) | Yes |
| **Webhooks (Real-time)** | Yes (you host) | Advanced+ ($279) | Pro+ ($15) | Premium ($299) | Yes (after swap) |
| **Multi-channel** | TikTok only | WhatsApp, LINE, Messenger, etc. | Instagram, FB, WhatsApp, etc. | WhatsApp, Instagram, etc. | Swappable per provider |
| **Vendor Lock-in** | None | High | Medium | High | None (provider pattern) |
| **Dev Effort** | High (build + maintain) | Low (managed) | Low (managed) | Low (managed) | Low (already built) |
| **Data Control** | Full | Via API only | Via API only | Via API only | Full |
| **TH Region Support** | Yes | Yes | Yes | Yes | Yes |
| **Maturity** | Beta | Production | Beta (TikTok) | Production | PoC ready |
| **Best For** | Long-term production | Enterprise omnichannel | Marketing automation | E-commerce + WhatsApp | Our team (demo now, free later) |

---

## 12-Month Cost Projection (THB estimates at ~35 THB/$)

| Option | Monthly (THB) | Year 1 (THB) |
|---|---|---|
| TikTok Direct API | ~0 | ~0 + hosting |
| Manychat Pro (500 contacts) | ~525 | ~6,300 |
| Respond.io Growth | ~5,565 | ~61,215 |
| Respond.io Advanced | ~9,765 | ~107,415 |
| SleekFlow Premium | ~10,465 | ~125,580 |
| **Hybrid (recommended)** | **~5,565 → 0** | **~17,500–28,000** |

---

## Recommendation: Hybrid Approach

```
Phase 1 (Now)          Phase 2 (Week 3-4)
Respond.io ---------> TikTok Direct API
$159/mo                $0/mo
Polling (1s)           Real-time webhooks
Demo-ready today       Production-ready
```

**Steps:**
1. **Now** — Present working PoC (live on Render + localhost)
2. **Week 1–2** — Apply for TikTok Business Messaging API at developers.tiktok.com
3. **Week 3–4** — Swap provider with one env var change: `PROVIDER=official`
4. **Result** — $0/mo ongoing, real-time webhooks, full data control

**Why this works:**
- PoC is live and demonstrable today
- Provider-agnostic architecture (swap with 1 config change, no code rewrite)
- Thailand is fully supported by TikTok's API
- Long-term cost: $0 (only ~$7/mo hosting)

---

## Live Demo

| | URL |
|---|---|
| Production | https://message-gateway-x7ja.onrender.com |
| Local | http://localhost:3000 |
| Source | github.com/bondzai/message-gateway |

---

*Vulcan TikTok DM Integration PoC — Built with Node.js, Socket.IO, swappable provider architecture*
