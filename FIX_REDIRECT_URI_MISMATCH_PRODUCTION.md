# Fix: redirect_uri_mismatch Error in Production

## The Problem

You're getting this error when trying to authorize:
```
Error 400: redirect_uri_mismatch
```

This happens when the redirect URI in your request doesn't **exactly match** what's configured in Google Cloud Console.

## Quick Fix Steps

### Step 1: Check What's in Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to: **APIs & Services** → **Credentials**
3. Find your OAuth 2.0 Client ID (the one you're using for production)
4. Click the **edit/pencil icon** (✏️)
5. Scroll down to **"Authorized redirect URIs"**
6. **Write down EXACTLY what's listed there**

It should be:
```
https://meetingnotesgenerator.vercel.app/api/auth/google/callback
```

**Check for:**
- ✅ Exact match (no extra spaces, no trailing slash)
- ✅ `https://` (not `http://`)
- ✅ Correct domain (`meetingnotesgenerator.vercel.app`)
- ✅ Full path (`/api/auth/google/callback`)

### Step 2: Check Vercel Environment Variables

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project: `meetingnotesgenerator`
3. Go to: **Settings** → **Environment Variables**
4. Find `GOOGLE_REDIRECT_URI`
5. **It must EXACTLY match** what's in Google Cloud Console

Should be:
```
https://meetingnotesgenerator.vercel.app/api/auth/google/callback
```

### Step 3: Common Mismatches

❌ **Wrong:**
- `https://meetingnotesgenerator.vercel.app/api/auth/google/callback/` (trailing slash)
- `https://meetingnotesgenerator-xyz.vercel.app/api/auth/google/callback` (different subdomain)
- `http://meetingnotesgenerator.vercel.app/api/auth/google/callback` (http instead of https)
- `https://meetingnotesgenerator.vercel.app/api/auth/google/callback ` (trailing space)

✅ **Correct:**
- `https://meetingnotesgenerator.vercel.app/api/auth/google/callback` (exact match)

### Step 4: Fix the Mismatch

**If they don't match:**

1. **Update Google Cloud Console:**
   - Edit your OAuth client
   - Remove any incorrect URIs
   - Add the correct one: `https://meetingnotesgenerator.vercel.app/api/auth/google/callback`
   - Click **"SAVE"**

2. **Update Vercel:**
   - Edit `GOOGLE_REDIRECT_URI` environment variable
   - Set it to: `https://meetingnotesgenerator.vercel.app/api/auth/google/callback`
   - Make sure it's set for **Production** environment
   - Click **"Save"**

3. **Redeploy:**
   - Go to **Deployments** tab
   - Click **"..."** on latest deployment
   - Click **"Redeploy"**

### Step 5: Wait and Retry

- Google can take 2-3 minutes to propagate changes
- Wait a few minutes after updating
- Try authorizing again

## Verification Checklist

Before trying to authorize again, verify:

- [ ] Google Cloud Console has: `https://meetingnotesgenerator.vercel.app/api/auth/google/callback`
- [ ] Vercel `GOOGLE_REDIRECT_URI` is: `https://meetingnotesgenerator.vercel.app/api/auth/google/callback`
- [ ] No trailing slashes
- [ ] No extra spaces
- [ ] Using `https://` (not `http://`)
- [ ] Domain matches exactly (`meetingnotesgenerator.vercel.app`)
- [ ] Waited 2-3 minutes after making changes

## Still Not Working?

### Check Your Vercel Domain

Your Vercel app might have a different URL. Check:

1. Go to Vercel Dashboard → Your Project → **Settings** → **Domains**
2. See what your actual production domain is
3. It might be:
   - `meetingnotesgenerator.vercel.app` (default)
   - `meetingnotesgenerator-xyz.vercel.app` (with random suffix)
   - A custom domain

**Use the EXACT domain** that Vercel shows in both places.

### Debug: Check What URI is Being Sent

The error message from Google sometimes shows what URI was sent. Look for a line like:
```
redirect_uri=https://meetingnotesgenerator.vercel.app/api/auth/google/callback
```

Compare this to what's in Google Cloud Console - they must match exactly.

## Quick Test

After fixing, test by:

1. Visit: `https://meetingnotesgenerator.vercel.app/api/auth/google`
2. Copy the `authUrl` from the JSON
3. Open it in your browser
4. You should be able to authorize without the mismatch error
