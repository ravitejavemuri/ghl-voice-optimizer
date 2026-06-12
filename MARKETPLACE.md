# GHL Marketplace Listing Guide

List the Voice AI Agent Optimizer on the [HighLevel Marketplace](https://marketplace.gohighlevel.com/) as a **standalone embedded app** — no GHL API integration required.

Users upload transcripts manually, run analysis, and copy the optimized prompt into their voice agent themselves. The app runs inside GHL via a **Custom Menu** iframe.

---

## How it works

```
GHL sub-account
  → Custom Menu item (iframe)
  → Your hosted app (https://your-domain.com)
  → User uploads JSON transcripts + agent config
  → Analyze → copy recommendations
```

No OAuth, no Voice AI API scopes, no call-log import. The marketplace listing is a **hosted URL embedded in GHL** — not scripts injected into GHL pages.

---

## Embedding options in GHL (which one to use?)

GHL offers several ways to surface a third-party app. They are **not interchangeable**.

| Option | What it does | Fits this app? |
|--------|----------------|----------------|
| **Custom Menu** (recommended) | Sidebar item → loads your URL in an **iframe** | **Yes** — best match |
| **Custom Pages** | Full-page iframe (app details / after install) | **Yes** — good alternative |
| **Custom JS** | Injects `<script>` into GHL’s own UI | **No** — wrong tool for a full SPA |
| **Agency Custom Menu Links** | Agency adds iframe URL manually (no Marketplace app) | Works for internal use, not a public listing |

### Recommended: Custom Menu module

Your app is a full Vue dashboard hosted on your own server. GHL loads it in an iframe — exactly what **Custom Menu** is for.

```
GHL sidebar → "Voice AI Optimizer" → iframe → https://your-domain.com
```

Already supported in this repo via `Content-Security-Policy: frame-ancestors` in `backend/src/index.js`.

### Alternative: Custom Pages module

**Custom Pages** also load your hosted app in an iframe, but appear from the **Marketplace app install / app details** flow rather than (or in addition to) the sidebar.

| | Custom Menu | Custom Pages |
|---|-------------|--------------|
| Where it appears | Left sidebar | App details / post-install |
| Hosting | Your HTTPS URL | Your HTTPS URL |
| User context | URL merge fields (`{{location.id}}`) | `postMessage` SSO + Shared Secret (optional) |
| OAuth required | No (for embed-only) | No (for embed-only) |
| Best for | Day-to-day tool in sidebar | “Open app” landing after install |

If you only need `locationId` in the URL, **Custom Menu is enough**. Choose **Custom Pages** if you want the app to open from the install screen or need encrypted user context (email, role) via [GHL user context SSO](https://marketplace.gohighlevel.com/docs/other/user-context-marketplace-apps/) — still no Voice AI API required.

**Custom Pages URL:** same as Custom Menu — `https://your-domain.com/?locationId={{location.id}}`

**Optional SSO (Custom Pages only):** frontend sends `window.parent.postMessage({ message: "REQUEST_USER_DATA" }, "*")`, backend decrypts with `GHL_SHARED_SECRET`. Only needed if you want logged-in user identity — not required for upload/analyze/copy workflow.

### Custom JS — not suitable for this app

**Custom JavaScript** in the Marketplace is a different product:

- Injects small scripts **into GHL’s pages** (DOM tweaks, hooks) — not a hosted dashboard
- **Agency-distributed apps only** (distribution type Agency or Agency & Sub-account)
- **Security review** (~10 days SLA); no obfuscated code, no `console.log`, no remote script loads
- Guidelines explicitly say logic must be **self-contained** — you cannot load your Vue app from `https://your-domain.com` via Custom JS

So Custom JS is for things like “add a button on this GHL screen” or “restyle a panel” — **not** for embedding the Voice AI Optimizer.

**Do not use Custom JS to host this app.** Use Custom Menu or Custom Pages instead.

### Agency Custom Menu Links (without Marketplace)

Agencies can add iframe links under **Settings → Custom Menu Links** with merge fields:

```
https://your-domain.com/?locationId={{location.id}}
```

Useful for testing or white-label SaaS plans, but **not** a substitute for a Marketplace listing if you want public distribution.

---

## Step 1 — Deploy the app

### Environment (`backend/.env`)

```bash
PORT=3001
APP_URL=https://your-domain.com

LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
TRANSCRIPT_CONCURRENCY=4
ANALYSIS_CACHE=false
RUN_LOGS=true
```

Ollama won't work in cloud hosting — use OpenAI in production.

### Docker

```bash
docker compose up --build -d
```

Verify: `https://your-domain.com/api/health`

The app sets `Content-Security-Policy: frame-ancestors` so GHL can embed it in an iframe.

---

## Step 2 — Register Marketplace app

1. Go to [marketplace.gohighlevel.com](https://marketplace.gohighlevel.com/) → **My Apps** → **Create App**
2. Settings:
   - **App type:** Private (while testing) → Public when ready
   - **Target user:** Sub-account
   - **Who can install:** Agency & Sub-account

### OAuth / API scopes

**None required.** This app does not call GHL APIs. Skip OAuth scopes, redirect URLs, and webhooks unless GHL requires them for your distribution type — in that case register the app with zero data scopes and use only the Custom Menu module.

### Custom Menu module (recommended)

In **Build → Modules → Custom Menu**, add a menu item:

| Field | Value |
|-------|--------|
| **Name** | Voice AI Optimizer |
| **URL** | `https://voice-ai-optimizer.onrender.com/?locationId={{location.id}}` |

GHL opens your app in an iframe. The `locationId` query param is passed for context (shown in the footer); the app does not use it for API calls.

### Custom Pages module (optional alternative)

In **Build → Modules → Custom Pages**, set the same URL. Users open the app from the Marketplace app details / post-install flow instead of the sidebar. Optional: implement [user context SSO](https://marketplace.gohighlevel.com/docs/other/user-context-marketplace-apps/) via `postMessage` if you need `userId` / `email` — not required for the current workflow.

**Do not use Custom JS** for this app — see [Embedding options](#embedding-options-in-ghl-which-one-to-use) above.

---

## Step 3 — Listing profile

Before going **Public**, complete **Build → Profile**:

- [ ] App logo (512×512)
- [ ] Category (e.g. AI / Productivity)
- [ ] Short description (1–2 sentences)
- [ ] Long description (what it does, workflow)
- [ ] 3–5 screenshots (Home, Analysis, Evaluation tabs)
- [ ] Privacy policy URL
- [ ] Support email or help URL
- [ ] Pricing (free recommended for initial launch)

### Suggested short description

> Analyze voice agent call transcripts, detect recurring failures, generate test cases, and get an optimized agent prompt — all from one dashboard.

### Suggested workflow copy (for listing)

1. Paste your agent prompt and upload call transcript JSON files
2. Click **Analyze** to run the AI pipeline
3. Review failures, patterns, and test cases
4. Copy the optimized prompt into your voice agent settings
5. Re-test and re-upload transcripts to measure improvement

---

## Step 4 — Test in sandbox

1. Install your **Private** app on a GHL sandbox sub-account
2. Open the Custom Menu item — app should load in iframe
3. Upload transcripts → Analyze → verify all tabs work
4. Confirm footer shows `Embedded · location …`
5. Copy optimized prompt manually (no API write-back)

---

## Step 5 — Go public

1. Switch app type from Private → Public
2. Submit for Marketplace review
3. Monitor **Insights** for installs and errors

---

## What you do NOT need

| Not needed | Why |
|------------|-----|
| Voice AI API scopes | No GHL data read/write |
| OAuth token storage | No API calls |
| Postgres / Redis | In-memory session is fine per user session* |
| Webhooks | No install lifecycle handling in-app |
| GHL Agents API | User copies prompt manually |

\* For high traffic, consider session persistence later — not required for marketplace v1.

---

## Hosting checklist

- [ ] HTTPS with valid certificate
- [ ] `APP_URL` matches public domain
- [ ] `OPENAI_API_KEY` set (production LLM)
- [ ] Health check: `GET /api/health`
- [ ] Custom Menu URL uses `{{location.id}}` template
- [ ] Test iframe load from GHL sandbox (not just direct URL)

---

## References

- [Create Marketplace App](https://marketplace.gohighlevel.com/docs/oauth/CreateMarketplaceApp/)
- [Developer Marketplace getting started](https://help.gohighlevel.com/support/solutions/articles/155000000136-how-to-get-started-with-the-developer-s-marketplace)
- [Marketplace app distribution types](https://help.gohighlevel.com/support/solutions/articles/155000002141-marketplace-app-distribution-type)
