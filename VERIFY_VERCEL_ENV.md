# Verify Vercel Environment Variables

## Check Your Vercel Environment Variables

Since your Google Cloud Console has:
```
https://meetingnotesgenerator.vercel.app/api/auth/google/callback
```

You need to verify these match in Vercel:

### Step 1: Check Vercel Environment Variables

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click on your project: `meetingnotesgenerator`
3. Go to: **Settings** → **Environment Variables**
4. Check these variables:

**GOOGLE_REDIRECT_URI** should be:
```
https://meetingnotesgenerator.vercel.app/api/auth/google/callback
```

**GOOGLE_CLIENT_ID** should match the Client ID from Google Cloud Console

**GOOGLE_CLIENT_SECRET** should match the Client Secret from Google Cloud Console

### Step 2: Verify No Trailing Spaces

When editing in Vercel, make sure there are:
- ❌ No trailing spaces
- ❌ No trailing slashes
- ✅ Exact match: `https://meetingnotesgenerator.vercel.app/api/auth/google/callback`

### Step 3: Check Which Environment

Make sure `GOOGLE_REDIRECT_URI` is set for:
- ✅ **Production** environment (at minimum)
- Optionally: Preview and Development

### Step 4: Redeploy After Changes

After updating environment variables:
1. Go to **Deployments** tab
2. Click **"..."** on your latest deployment
3. Click **"Redeploy"**

This ensures the new environment variables are used.
