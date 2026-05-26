# Calendar OAuth Setup (Google + Microsoft)

This is a one-time setup. After this, every contractor signing up clicks one
button on `/dashboard/calendar` and connects their own calendar in 30 seconds.

Direct OAuth into Google Calendar API + Microsoft Graph. **Zero monthly fees.**
Replaced Cronofy on 2026-05-26 (was $819/mo Emerging plan).

---

## Required env vars (Vercel)

Set these in Vercel → Project → Settings → Environment Variables for
**Production + Preview + Development**:

```
GOOGLE_OAUTH_CLIENT_ID         (from Google Cloud Console)
GOOGLE_OAUTH_CLIENT_SECRET     (from Google Cloud Console)
MICROSOFT_OAUTH_CLIENT_ID      (from Azure Entra)
MICROSOFT_OAUTH_CLIENT_SECRET  (from Azure Entra)
CALENDAR_TOKEN_ENCRYPTION_KEY  (already set — used for AES-GCM at rest)
```

Optional (override defaults):
```
GOOGLE_OAUTH_REDIRECT_URI       defaults to {NEXT_PUBLIC_APP_URL}/api/calendar/google/callback
MICROSOFT_OAUTH_REDIRECT_URI    defaults to {NEXT_PUBLIC_APP_URL}/api/calendar/microsoft/callback
```

You can safely delete the legacy Cronofy env vars (`CRONOFY_*`).

---

## Part 1 — Google Cloud Console (~10 min)

### 1. Create the project (skip if BellAveGo project already exists)

1. Go to https://console.cloud.google.com
2. Top bar dropdown → **New Project**
3. Name: `BellAveGo` · click **Create**
4. Wait ~10s, then switch into the new project from the top bar

### 2. Enable Google Calendar API

1. Sidebar → **APIs & Services** → **Library**
2. Search "Google Calendar API" → click result → **Enable**

### 3. Configure OAuth consent screen

1. Sidebar → **APIs & Services** → **OAuth consent screen**
2. User Type: **External** → **Create**
3. App information:
   - **App name:** BellAveGo
   - **User support email:** peter@bellavego.com
   - **App logo:** upload `public/logo.png` (optional but recommended)
4. App domain:
   - **Application home page:** https://www.bellavego.com
   - **Privacy policy:** https://www.bellavego.com/privacy
   - **Terms of service:** https://www.bellavego.com/terms
5. Authorized domains: **bellavego.com**
6. Developer contact: peter@bellavego.com
7. **Save and Continue**
8. Scopes screen → **Add or Remove Scopes** → add:
   - `.../auth/userinfo.email`
   - `.../auth/userinfo.profile`
   - `openid`
   - `.../auth/calendar.readonly`
   - `.../auth/calendar.calendarlist.readonly`
   - `.../auth/calendar.events`
   - **Save and Continue**
9. Test users screen — skip (we'll publish below)
10. Summary → **Back to Dashboard**
11. Click **Publish App** (status: In production). Until verification approves, Google shows users an "unverified app" warning. **Submit for verification** once first 5 customers are connected (takes 1-5 business days, free).

### 4. Create OAuth 2.0 Client ID

1. Sidebar → **APIs & Services** → **Credentials**
2. **Create Credentials** → **OAuth client ID**
3. Application type: **Web application**
4. Name: `BellAveGo Web`
5. **Authorized redirect URIs:** add ALL of these:
   - `https://www.bellavego.com/api/calendar/google/callback`
   - `https://bellavego.com/api/calendar/google/callback` (apex domain, just in case)
   - `http://localhost:3000/api/calendar/google/callback` (local dev)
6. **Create**
7. A modal pops up with **Client ID** and **Client secret** — copy both.

### 5. Paste into Vercel env

```
GOOGLE_OAUTH_CLIENT_ID     = <Client ID from step 6>
GOOGLE_OAUTH_CLIENT_SECRET = <Client secret from step 6>
```

### 6. Redeploy

Vercel auto-redeploys on env var change. Or push any commit to main.

---

## Part 2 — Microsoft Entra (Azure) (~10 min)

### 1. Open Azure Portal

1. Go to https://portal.azure.com (sign in with the Microsoft account you want to own this app — personal or work both fine)
2. Search bar → **Microsoft Entra ID** → click

### 2. Register the app

1. Sidebar → **App registrations** → **New registration**
2. Name: `BellAveGo Calendar`
3. **Supported account types:** select **Accounts in any organizational directory (Any Microsoft Entra ID tenant - Multitenant) and personal Microsoft accounts (e.g. Skype, Xbox)**
   - This is the key choice — it lets contractors connect with both work and personal Outlook accounts.
4. **Redirect URI:**
   - Platform: **Web**
   - URL: `https://www.bellavego.com/api/calendar/microsoft/callback`
5. **Register**
6. On the overview page, copy **Application (client) ID**.

### 3. Add the second redirect URI for local dev

1. Sidebar → **Authentication** (under Manage)
2. Under **Web** → **Add URI**:
   - `http://localhost:3000/api/calendar/microsoft/callback`
3. Under **Implicit grant** leave both unchecked (we use the code flow only)
4. Under **Supported account types** confirm it shows the multi-tenant + personal option
5. **Save**

### 4. Create the client secret

1. Sidebar → **Certificates & secrets**
2. **+ New client secret**
3. Description: `BellAveGo prod`
4. Expires: **24 months** (set a reminder to rotate)
5. **Add**
6. **Copy the Value column IMMEDIATELY** — it only shows once. The "Secret ID" is NOT the secret; you want the **Value**.

### 5. Add API permissions

1. Sidebar → **API permissions**
2. **Add a permission** → **Microsoft Graph** → **Delegated permissions**
3. Search and check:
   - `Calendars.ReadWrite`
   - `User.Read`
   - `offline_access`
   - `openid`
   - `profile`
   - `email`
4. **Add permissions**
5. **Grant admin consent for <tenant>** is optional for delegated personal/work flows — users consent themselves at first sign-in. Skip unless you're locking this to a single tenant.

### 6. Paste into Vercel env

```
MICROSOFT_OAUTH_CLIENT_ID     = <Application (client) ID from step 2.6>
MICROSOFT_OAUTH_CLIENT_SECRET = <Value from step 4.6>
```

### 7. Redeploy

Same as Google.

---

## Part 3 — Test the full flow

1. Sign in to https://www.bellavego.com/dashboard/calendar
2. Click **Connect Google Calendar** → grant permissions → confirm redirect lands back on /dashboard/calendar with the green "Connected" banner.
3. Click **Disconnect** → confirm the row clears.
4. Click **Connect Microsoft Outlook** → same flow with a Microsoft account.
5. Make a test inbound call to your AI receptionist → ask to book an appointment → confirm the event lands in Google Calendar / Outlook.

If anything errors, check the Vercel logs for the `/api/calendar/google/callback` or `/api/calendar/microsoft/callback` route.

---

## Verification (later — once you have 5+ customers)

### Google — submit verification

1. https://console.cloud.google.com → APIs & Services → OAuth consent screen
2. Status shows "In production · unverified" — click **Prepare for verification**
3. Fill the form (the sensitive scopes review takes ~3-5 business days)
4. Once approved, the "unverified app" warning disappears for all users

### Microsoft — submit publisher verification (optional)

1. Get a Microsoft Partner Network ID (free)
2. Entra ID → App registrations → BellAveGo Calendar → Branding & properties → Add publisher
3. Approval ~1-2 days

Both verifications are FREE. They just remove the consent-screen warning. Users can connect before verification — they just see a yellow "unverified" notice that you can preempt with the explainer on `/dashboard/calendar`.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `redirect_uri_mismatch` after clicking Connect | The redirect URI in OAuth client config doesn't EXACTLY match what the app sends. Compare characters: `https://` vs `http://`, trailing slash, apex vs www. |
| `invalid_client` | Wrong client secret in Vercel. Copy it again from Google/Azure. |
| `insufficient_scope` 403 when booking | Contractor connected before write scope was added. They need to **Disconnect → reconnect**. The dashboard surfaces this prompt automatically. |
| Microsoft `AADSTS50011` | Add the missing redirect URI in Entra → App registrations → Authentication. |
| Microsoft `AADSTS500113` | Personal Microsoft accounts are blocked because the app registration is set to single tenant. Change to multi-tenant + personal in Entra → Authentication. |
| Vercel build fails citing missing env | Env vars weren't set in BOTH Production and Preview. Set in all 3 (Production, Preview, Development). |
