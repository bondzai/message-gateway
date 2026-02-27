# TikTok OAuth Setup Guide

> Step-by-step guide for engineers to set up TikTok Login Kit OAuth.
> This documents every pitfall we hit so you don't have to.

---

## Prerequisites

- TikTok Developer account: https://developers.tiktok.com/
- App deployed with HTTPS (e.g., Render, Vercel, AWS)
- Node.js server running this codebase

---

## Step 1: Create TikTok App

1. Go to https://developers.tiktok.com/ → **Developer Portal**
2. Click **Manage apps** → **Create app** (or use existing)
3. Fill in basic info: App name, Icon, Category, Description

---

## Step 2: Add Login Kit Product

1. In your app → **Products** (left sidebar) → **Add product**
2. Select **Login Kit**
3. Configure Login Kit:
   - **Platform:** check **Web**
   - **Redirect URI:** your HTTPS callback URL

Example:
```
https://your-app.onrender.com/auth/callback
```

**Redirect URI rules:**
- Must start with `https://` (no `http://`, no localhost)
- No query parameters or fragments (`#`)
- Must be under 512 characters
- Must match EXACTLY what your server generates (no trailing slash mismatch)

---

## Step 3: Set App URLs

In **App details** → **URL properties** (or same page):

| Field | Example |
|---|---|
| Terms of Service URL | `https://your-app.onrender.com/terms.html` |
| Privacy Policy URL | `https://your-app.onrender.com/privacy.html` |
| Web/Desktop URL | `https://your-app.onrender.com` |

These pages must be live and accessible — TikTok may verify them.

---

## Step 4: Sandbox vs Production — USE THE RIGHT CREDENTIALS

**This is the #1 mistake.** TikTok apps have two separate environments:

| | Production | Sandbox |
|---|---|---|
| Client Key | different | different |
| Client Secret | different | different |
| Needs review | Yes (takes days) | No (instant) |
| Who can login | Anyone | Only Target Users |

**CRITICAL:** When you click the **Sandbox** tab, TikTok shows you **different credentials** than the Production tab. You MUST use the credentials matching your active environment.

To check:
1. Click **Sandbox** tab at the top of your app page
2. Click the eye icon next to **Client key** and **Client secret**
3. Copy these values into your `.env` file

```bash
# .env — use SANDBOX credentials for development
TIKTOK_CLIENT_KEY=<sandbox_client_key>
TIKTOK_CLIENT_SECRET=<sandbox_client_secret>
```

---

## Step 5: Add Target Users (Sandbox Only)

Sandbox apps only allow explicitly listed users to authorize:

1. Go to **Sandbox settings** (left sidebar)
2. Add your TikTok username as a **Target User**
3. Save

Without this, you'll get: `Something went wrong → client_key`

---

## Step 6: Configure Scopes

1. Go to **Scopes** (left sidebar)
2. Enable `user.info.basic` (required for Login Kit)
3. Enable any other scopes your app needs

**Important:** Only request scopes that are approved. Invalid scopes will cause OAuth to fail silently.

---

## Step 7: Deploy and Test

1. Set your `.env` with the Sandbox credentials
2. Deploy to your HTTPS host
3. Go to `https://your-app.onrender.com/accounts.html`
4. Click **Connect TikTok Account**
5. You should see TikTok's authorization page
6. Grant permissions → redirected back with account connected

---

## OAuth URL Format (Web Apps)

TikTok Web Login Kit uses standard OAuth 2.0 **without PKCE**:

```
https://www.tiktok.com/v2/auth/authorize/
  ?client_key=<CLIENT_KEY>
  &response_type=code
  &scope=user.info.basic
  &redirect_uri=<REDIRECT_URI>
  &state=<RANDOM_STATE>
```

**DO NOT add** `code_challenge` or `code_challenge_method` — those are for Desktop apps only. Sending PKCE params to a Web-configured app causes errors.

### Token Exchange

```http
POST https://open.tiktokapis.com/v2/oauth/token/
Content-Type: application/x-www-form-urlencoded

client_key=<KEY>
&client_secret=<SECRET>
&code=<AUTH_CODE>
&grant_type=authorization_code
&redirect_uri=<REDIRECT_URI>
```

---

## Common Errors and Fixes

### `Something went wrong → code_challenge`

| Cause | Fix |
|---|---|
| Sending PKCE params to a Web app | Remove `code_challenge` and `code_challenge_method` from the authorize URL |
| Wrong PKCE encoding (Desktop apps only) | TikTok uses **hex-encoded SHA256**, not base64url. `createHash('sha256').update(verifier).digest('hex')` |
| Browser caching old redirect URL | Use `Cache-Control: no-store` + cache-busting `?t=Date.now()` on connect URL |

### `Something went wrong → client_key`

| Cause | Fix |
|---|---|
| Using Production credentials with Sandbox app | Copy credentials from **Sandbox** tab, not Production |
| Login Kit not added | Add Login Kit as a product in your app |
| Redirect URI mismatch | Must match exactly — check `https` vs `http`, trailing slash |
| Target User not added (Sandbox) | Add your TikTok username in Sandbox settings |
| `http://localhost` redirect URI | TikTok requires `https://` — use deployed URL |

### `Something went wrong → redirect_uri`

| Cause | Fix |
|---|---|
| URI not registered | Add exact URI in Login Kit → Web → Redirect URI |
| Protocol mismatch (`http` vs `https`) | Add `app.set('trust proxy', 1)` in Express when behind a proxy (Render, AWS, etc.) |
| Trailing slash mismatch | `/auth/callback` ≠ `/auth/callback/` — must match exactly |

### Browser caching issues

Symptoms: works in incognito but not in regular browser.

| Fix | How |
|---|---|
| Server-side | `res.set('Cache-Control', 'no-store')` before redirect |
| Client-side | Add `?t=Date.now()` to connect URL |
| HTTP status | Use `res.redirect(303, url)` instead of `302` (browsers don't cache 303) |
| Nuclear option | Chrome → `chrome://settings/content/all` → search `tiktok` → delete all site data |

---

## Express Server Checklist

```javascript
// 1. Trust proxy (required behind Render/AWS/Nginx)
app.set('trust proxy', 1);

// 2. Build redirect URI consistently
function buildRedirectUri(req) {
  const proto = req.get('x-forwarded-proto') || req.protocol;
  const host = req.get('host');
  return `${proto}://${host}/auth/callback`;
}

// 3. No-cache on OAuth redirect
res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
res.redirect(303, oauthUrl);

// 4. Static files — disable caching during development
app.use(express.static('public', { maxAge: 0 }));
```

---

## Reference

- [TikTok Login Kit for Web](https://developers.tiktok.com/doc/login-kit-web/)
- [TikTok Login Kit for Desktop](https://developers.tiktok.com/doc/login-kit-desktop/) (PKCE required here)
- [Manage User Access Tokens](https://developers.tiktok.com/doc/login-kit-manage-user-access-tokens/)
- [OAuth Error Handling](https://developers.tiktok.com/doc/oauth-error-handling/)
