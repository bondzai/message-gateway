# Cost Comparison — TikTok DM Integration Options

> Vulcan PoC | February 2026 | Region: Thailand

## Summary

| | TikTok Direct API | Respond.io | Manychat | SleekFlow | **Hybrid (Recommended)** |
|---|---|---|---|---|---|
| **Monthly Cost** | Free | $159–279/mo | $15–100/mo | $299/mo | **$159 → Free** |
| **Year 1 Cost** | ~$0 + hosting | $1,749–3,069 | $180–1,200 | $3,588 | **~$500–800** |
| **Setup Time** | 1–2 weeks | Done (PoC live) | 1–2 days | 1–2 days | Done (PoC live) |
| **TikTok DM** | Yes | Yes | Yes (Beta) | Yes | Yes |
| **API Access** | Yes | Growth+ ($159) | Pro+ ($15) | Premium ($299) | Yes |
| **Webhooks** | Yes (you host) | Advanced+ ($279) | Pro+ ($15) | Premium ($299) | Yes (after swap) |
| **Multi-channel** | TikTok only | WhatsApp, LINE, etc. | Instagram, FB, etc. | WhatsApp, Instagram | Swappable |
| **Vendor Lock-in** | None | High | Medium | High | **None** |
| **Data Control** | Full | Via API only | Via API only | Via API only | **Full** |

## 12-Month Cost (THB, ~35 THB/$)

| Option | Monthly (THB) | Year 1 (THB) |
|---|---|---|
| TikTok Direct API | ~0 | ~0 + hosting |
| Manychat Pro | ~525 | ~6,300 |
| Respond.io Growth | ~5,565 | ~61,215 |
| Respond.io Advanced | ~9,765 | ~107,415 |
| SleekFlow Premium | ~10,465 | ~125,580 |
| **Hybrid** | **~5,565 → 0** | **~17,500–28,000** |

## Recommendation: Hybrid

```
Phase 1 (Now)              Phase 2 (Week 3-4)
Respond.io ──────────────> TikTok Direct API
$159/mo                    $0/mo
Polling (1s)               Real-time webhooks
Demo-ready today           Production-ready
```

1. **Now** — Present working PoC (live on Render)
2. **Week 1–2** — Apply for TikTok Business Messaging API
3. **Week 3–4** — Swap provider: `PROVIDER=official`
4. **Result** — $0/mo ongoing, only ~$7/mo hosting

## Live Demo

| Environment | URL |
|---|---|
| Production | https://message-gateway-x7ja.onrender.com |
| Local | http://localhost:3000 |
| Source | github.com/bondzai/message-gateway |
