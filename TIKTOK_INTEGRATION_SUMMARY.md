# How TikTok Live Chat Connection Works

## Connection Flow

```
Your Server                    Euler Sign Server              TikTok WebCast
    │                               │                              │
    │  1. new WebcastPushConnection("@username")                   │
    │──────────────────────────────> │                              │
    │  2. Request signed WebSocket URL                             │
    │  (uses EulerSigner under the hood)                           │
    │ <─────────────────────────────│                              │
    │  3. Signed URL returned                                      │
    │                                                              │
    │  4. Open WebSocket (or fallback to HTTP polling @ 1s)        │
    │─────────────────────────────────────────────────────────────>│
    │                                                              │
    │  5. Protobuf-encoded messages (chat, gifts, joins, etc.)     │
    │<─────────────────────────────────────────────────────────────│
    │  6. Library deserializes protobuf → JS objects               │
    │  7. Emits typed events: 'chat', 'gift', 'member', etc.      │
```

## Key Technical Details

| Aspect | Detail |
|---|---|
| **Protocol** | WebSocket (primary), HTTP long-polling (fallback) |
| **Data format** | Protobuf (binary), decoded by the library into JS objects |
| **Auth required** | **None** for read-only. Just a username. |
| **Signing** | URL must be signed via [Euler Stream](https://www.eulerstream.com/docs) sign server (bundled, free tier available) |
| **API key** | Optional `signApiKey` for higher rate limits on the sign server |
| **Session ID** | Only needed if you want to **send** chat messages (currently broken due to TikTok signature changes) |
| **Input** | Just the streamer's `uniqueId` (the `@username` from their profile URL) |
| **Streamer must be live** | Yes — connection fails if the stream isn't active |

## Minimal Integration Code

```js
import { WebcastPushConnection } from 'tiktok-live-connector';

const conn = new WebcastPushConnection('username');

conn.connect().then(state => {
  console.log(`Connected to room ${state.roomId}`);
});

conn.on('chat', data => {
  // data.uniqueId, data.nickname, data.comment, data.userId,
  // data.profilePictureUrl, data.followRole, data.userBadges, etc.
  console.log(`${data.uniqueId}: ${data.comment}`);
});
```

## Available Events (beyond chat)

| Event | Description |
|---|---|
| `chat` | Chat messages (comments) |
| `gift` | Gifts sent (with diamond value, streak info) |
| `member` | Viewer joins the stream |
| `like` | Likes sent |
| `social` | Follows and shares |
| `subscribe` | New subscriptions |
| `roomUser` | Viewer count updates + top gifter list |
| `questionNew` | Q&A questions |
| `linkMicBattle` / `linkMicArmies` | Live battles |
| `emote` | Subscriber emotes/stickers |
| `streamEnd` | Stream terminated (by user or moderator ban) |

---

## Trade-offs

### Pros

| | |
|---|---|
| **Zero auth** | No API key, no OAuth, no TikTok developer account needed |
| **Real-time** | WebSocket push — sub-second latency |
| **Rich data** | User profiles, badges, follow status, gift values all included |
| **Read-only safe** | No write access = no risk of account actions |
| **Multi-language** | Available in Node.js, Python, Java, C#, Go, Rust |
| **Free** | No cost for basic usage |

### Cons / Risks

| | |
|---|---|
| **Unofficial / Reverse-engineered** | Not sanctioned by TikTok. Can break at any time without notice. Has already broken before (versions < v1.1.7 are dead). |
| **Third-party sign server dependency** | All connections route through Euler Stream's sign server to get signed WebSocket URLs. If that server goes down or changes pricing, you're blocked. |
| **No official SLA** | No uptime guarantee, no support contract, no versioned API |
| **No official TikTok Live API exists** | TikTok only provides live API access to StreamLabs. There is **no official alternative** to fall back on. |
| **Rate limits are opaque** | TikTok may throttle or block IPs without warning. No documented rate limits. |
| **Send messages is broken** | Due to increased TikTok signature requirements, `sendMessage()` currently doesn't work — read-only only |
| **Legal grey area** | Reverse-engineering TikTok's internal service may violate their ToS. Not affiliated with or endorsed by TikTok. |
| **Streamer must be live** | Cannot connect to offline streams — no historical data access |

### Recommendation for Production

If you need this for a **production system**, be aware:

1. Build a fallback/retry layer — connections will break periodically when TikTok updates their internals
2. Pin the `tiktok-live-connector` version and monitor the [GitHub repo](https://github.com/zerodytrash/TikTok-Live-Connector) for breaking changes
3. Consider the paid Euler Stream sign API key for better reliability
4. Design your architecture (like our EventBus pattern) so the TikTok source can be swapped out if a better option emerges

For a **PoC or internal tool**, it works great as-is with minimal setup.

---

## References

- [TikTok-Live-Connector GitHub](https://github.com/zerodytrash/TikTok-Live-Connector)
- [tiktok-live-connector npm](https://www.npmjs.com/package/tiktok-live-connector)
- [Euler Stream Docs](https://www.eulerstream.com/docs)
- [TikTok API Rate Limits (official, non-live)](https://developers.tiktok.com/doc/tiktok-api-v2-rate-limit)
