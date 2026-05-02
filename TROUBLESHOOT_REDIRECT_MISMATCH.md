# Troubleshoot Redirect URI Mismatch After Updating Vercel

## You've Updated Vercel - Now What?

Since you've updated `GOOGLE_REDIRECT_URI` in Vercel, follow these steps:

### Step 1: Verify CLIENT_SECRET Also Matches

You mentioned `GOOGLE_CLIENT_ID` matches, but also check:

- ✅ `GOOGLE_CLIENT_SECRET` in Vercel matches the one in Google Cloud Console
- ✅ Both are from the **same OAuth client** (the production one)

**To check in Google Cloud Console:**
1. Go to APIs & Services → Credentials
2. Find your OAuth client (the one with the production redirect URI)
3. Click edit
4. The Client Secret should match what's in Vercel

**Note:** If you can't see the secret, you may need to create a new one or check your notes.

### Step 2: Redeploy Your Vercel App

**CRITICAL:** After updating environment variables, you MUST redeploy:

1. Go to Vercel Dashboard → Your Project
2. Click **"Deployments"** tab
3. Find your latest deployment
4. Click the **"..."** menu (three dots)
5. Click **"Redeploy"**
6. Wait for deployment to complete

Environment variables are only loaded when the app starts, so a redeploy is required.

### Step 3: Check for Multiple Redirect URIs

In Google Cloud Console, make sure your OAuth client has **ONLY** the production URI:

1. Go to APIs & Services → Credentials
2. Edit your OAuth client
3. Under "Authorized redirect URIs", you should see:
   ```
   https://meetingnotesgenerator.vercel.app/api/auth/google/callback
   ```
4. **Remove any other URIs** (like localhost ones)
5. Click **"SAVE"**

### Step 4: Wait and Clear Cache

- Google can take **2-3 minutes** to propagate changes
- Wait a few minutes after making changes
- Try in an **incognito/private browser window** to avoid cache issues

### Step 5: Test Again

1. Visit: `https://meetingnotesgenerator.vercel.app/api/auth/google`
2. Copy the `authUrl` from the JSON response
3. Open it in a new incognito window
4. Try to authorize

## Still Getting the Error?

### Debug: Check What URI is Being Sent

The error message from Google sometimes shows what URI was received. Look for details like:

```
redirect_uri=https://meetingnotesgenerator.vercel.app/api/auth/google/callback
```

Compare this to what's in Google Cloud Console - they must match **exactly**.

### Check for Hidden Characters

Sometimes there are hidden characters or encoding issues:

1. In Vercel, delete the `GOOGLE_REDIRECT_URI` variable
2. Re-add it by typing it fresh (don't copy-paste)
3. Make sure it's exactly: `https://meetingnotesgenerator.vercel.app/api/auth/google/callback`
4. Save and redeploy

### Verify OAuth Client Match

Make absolutely sure:
- The `GOOGLE_CLIENT_ID` in Vercel matches the OAuth client that has the production redirect URI
- The `GOOGLE_CLIENT_SECRET` in Vercel matches that same OAuth client
- You're not mixing credentials from different OAuth clients

## Quick Checklist

Before trying again:
- [ ] `GOOGLE_REDIRECT_URI` in Vercel = `https://meetingnotesgenerator.vercel.app/api/auth/google/callback`
- [ ] `GOOGLE_CLIENT_ID` in Vercel matches Google Cloud Console
- [ ] `GOOGLE_CLIENT_SECRET` in Vercel matches Google Cloud Console
- [ ] OAuth client in Google Cloud Console has ONLY the production redirect URI
- [ ] Redeployed Vercel app after updating variables
- [ ] Waited 2-3 minutes after making changes
- [ ] Testing in incognito/private window
