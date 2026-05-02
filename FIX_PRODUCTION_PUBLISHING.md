# Fix: Cannot Publish to Production with Localhost URLs

## The Problem

Google won't let you publish your OAuth app to production if you have non-HTTPS redirect URIs (like `http://localhost:3003`). You'll see this error:

> "Setting publishing status as 'In production' is restricted to projects using HTTPS URLs only."

## Solution: Use Separate OAuth Clients (Recommended)

The best approach is to create **two separate OAuth 2.0 Client IDs**:

1. **Development Client** - For local development (with localhost)
2. **Production Client** - For production (HTTPS only)

### Step 1: Create a Production OAuth Client

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to: **APIs & Services** → **Credentials**
3. Click **"+ CREATE CREDENTIALS"** → **"OAuth client ID"**
4. Select **"Web application"**
5. Name it: **"MeetingNotesGenerator - Production"**
6. Under **"Authorized redirect URIs"**, add **ONLY**:
   ```
   https://meetingnotesgenerator.vercel.app/api/auth/google/callback
   ```
7. Click **"Create"**
8. **Copy the Client ID and Secret** - you'll need these for Vercel

### Step 2: Keep Your Development Client

Your existing client (with localhost) can stay as-is for local development. It will remain in "Testing" mode, which is fine for development.

### Step 3: Update Environment Variables

#### For Local Development (`.env.local`):
```env
# Use the DEVELOPMENT client (with localhost)
GOOGLE_CLIENT_ID=your_development_client_id
GOOGLE_CLIENT_SECRET=your_development_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3003/api/auth/google/callback
```

#### For Vercel Production:
In Vercel Dashboard → Settings → Environment Variables, use the **PRODUCTION** client:
```env
# Use the PRODUCTION client (HTTPS only)
GOOGLE_CLIENT_ID=your_production_client_id
GOOGLE_CLIENT_SECRET=your_production_client_secret
GOOGLE_REDIRECT_URI=https://meetingnotesgenerator.vercel.app/api/auth/google/callback
```

### Step 4: Publish the Production Client

1. Go to **OAuth consent screen**
2. Complete all required fields:
   - App name
   - User support email
   - Developer contact information
   - **Privacy policy URL** (required!)
   - Terms of service URL (optional)
3. Add your scopes:
   - `https://www.googleapis.com/auth/drive.readonly`
   - `https://www.googleapis.com/auth/drive.file`
4. Click **"PUBLISH APP"**

Since the production client only has HTTPS URLs, it will publish successfully.

### Step 5: Get Separate Refresh Tokens

You'll need **two different refresh tokens**:

1. **Development token** - From your localhost client (for local dev)
2. **Production token** - From your production client (for Vercel)

Get each one using the respective client's redirect URI.

## Alternative: Single Client with Temporary Removal

If you prefer to use a single OAuth client:

1. **Temporarily remove localhost redirect URI:**
   - Go to Credentials → Edit your OAuth client
   - Remove `http://localhost:3003/api/auth/google/callback`
   - Keep only: `https://meetingnotesgenerator.vercel.app/api/auth/google/callback`
   - Save

2. **Publish to production:**
   - Go to OAuth consent screen
   - Complete required fields
   - Click "PUBLISH APP"

3. **Add localhost back (optional):**
   - After publishing, you can try adding localhost back
   - However, this might affect your production status
   - Google may require you to keep only HTTPS URLs in production

**Note:** This approach is less ideal because you might lose the ability to use localhost with a production app.

## Why This Happens

Google's security policy requires production OAuth apps to use HTTPS only. This prevents:
- Man-in-the-middle attacks
- Token interception
- Security vulnerabilities

Localhost (HTTP) is allowed in "Testing" mode, but not in "Production" mode.

## Summary

**Recommended Approach:**
- ✅ Create separate OAuth clients for dev and production
- ✅ Development client stays in Testing mode (with localhost)
- ✅ Production client publishes to Production (HTTPS only)
- ✅ Use different credentials in `.env.local` vs Vercel

This gives you:
- ✅ Local development with localhost
- ✅ Production app in published status (longer-lived tokens)
- ✅ No conflicts between environments
