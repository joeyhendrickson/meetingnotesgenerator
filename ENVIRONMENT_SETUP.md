# Environment Variables Setup Guide

This guide explains how to set up environment variables for different environments (local development, Vercel production, and preview deployments).

## Important Concept

**You cannot set different values for different environments in a single `.env.local` file.** Here's how it actually works:

- **`.env.local`**: Only used for **local development** on your machine
- **Vercel Dashboard**: Separate settings for **Production**, **Preview**, and **Development** environments
- Each environment uses its own set of variables

## Local Development (`.env.local`)

Create a `.env.local` file in your project root (same directory as `package.json`). This file is **only for local development**:

```env
# OpenAI
OPENAI_API_KEY=sk-...

# Pinecone
PINECONE_API_KEY=...
PINECONE_ENVIRONMENT=us-east-1-aws
PINECONE_INDEX_NAME=ultra-index

# Google OAuth (for LOCAL development only)
GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here
GOOGLE_REDIRECT_URI=http://localhost:3003/api/auth/google/callback
GOOGLE_REFRESH_TOKEN=your_refresh_token_here

# Google Drive
GOOGLE_DRIVE_FOLDER_ID=your_folder_id_here

# App URL (for local development)
NEXT_PUBLIC_APP_URL=http://localhost:3003
```

**Key Points:**
- `GOOGLE_REDIRECT_URI` must be `http://localhost:3003/api/auth/google/callback` for local development
- This file is **never deployed** to Vercel (it's in `.gitignore`)
- Only use this when running `npm run dev` on your local machine

## Vercel Environment Variables

For Vercel deployments, you need to set environment variables **separately** in the Vercel dashboard for each environment.

### Setting Up in Vercel Dashboard

1. Go to your Vercel project: https://vercel.com/dashboard
2. Click on your project: `meetingnotesgenerator`
3. Go to **Settings** → **Environment Variables**
4. For each variable, click **"Add New"** and select which environments to apply it to:

#### Production Environment

Set these for **Production** (your live site at `https://meetingnotesgenerator.vercel.app`):

```env
OPENAI_API_KEY=sk-...
PINECONE_API_KEY=...
PINECONE_ENVIRONMENT=us-east-1-aws
PINECONE_INDEX_NAME=ultra-index
GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here
GOOGLE_REDIRECT_URI=https://meetingnotesgenerator.vercel.app/api/auth/google/callback
GOOGLE_REFRESH_TOKEN=your_refresh_token_here
GOOGLE_DRIVE_FOLDER_ID=your_folder_id_here
NEXT_PUBLIC_APP_URL=https://meetingnotesgenerator.vercel.app
```

**Important:** 
- `GOOGLE_REDIRECT_URI` must be `https://meetingnotesgenerator.vercel.app/api/auth/google/callback` for production
- Make sure this exact URI is also added in Google Cloud Console under "Authorized redirect URIs"

#### Preview Environment

For **Preview** deployments (pull requests, branches), you can either:

**Option A:** Use the same values as Production (simpler)
- Just select both "Production" and "Preview" when adding variables

**Option B:** Use preview-specific URLs (if you need different behavior)
- Set `GOOGLE_REDIRECT_URI` to a preview URL pattern
- Note: Preview URLs are dynamic (e.g., `https://meetingnotesgenerator-git-branch-username.vercel.app`)
- You may need to add wildcard redirect URIs in Google Cloud Console

#### Development Environment (Vercel)

The "Development" environment in Vercel is for Vercel's local development tools. You typically don't need to set this unless you're using Vercel CLI for local development.

### Quick Setup Steps

1. **In Vercel Dashboard:**
   - Settings → Environment Variables
   - Add each variable
   - Select **Production** (and optionally **Preview**)
   - Use production URL for `GOOGLE_REDIRECT_URI`

2. **In Google Cloud Console:**
   - APIs & Services → Credentials
   - Edit your OAuth 2.0 Client ID
   - Add **both** redirect URIs:
     - `http://localhost:3003/api/auth/google/callback` (for local dev)
     - `https://meetingnotesgenerator.vercel.app/api/auth/google/callback` (for production)

3. **Redeploy:**
   - After adding variables, redeploy your project
   - Go to Deployments → Click "..." → Redeploy

## Summary Table

| Environment | Where to Set | GOOGLE_REDIRECT_URI Value |
|------------|--------------|---------------------------|
| **Local Dev** | `.env.local` file | `http://localhost:3003/api/auth/google/callback` |
| **Production** | Vercel Dashboard → Production | `https://meetingnotesgenerator.vercel.app/api/auth/google/callback` |
| **Preview** | Vercel Dashboard → Preview | Same as Production (or preview-specific URL) |

## Common Mistakes

❌ **Wrong:** Trying to set different values in `.env.local` for different environments
- `.env.local` is ONLY for local development

❌ **Wrong:** Using `http://localhost:3003` in Vercel environment variables
- Vercel doesn't use `.env.local` - set variables in the dashboard

❌ **Wrong:** Forgetting to add redirect URI in Google Cloud Console
- You need BOTH localhost and production URIs in Google Cloud Console

✅ **Correct:** 
- `.env.local` for local development only
- Vercel Dashboard for production/preview
- Both redirect URIs in Google Cloud Console

## Testing

### Test Local Development:
```bash
npm run dev
# Visit http://localhost:3003
```

### Test Production:
- Visit https://meetingnotesgenerator.vercel.app
- Check that OAuth redirects work correctly

## Need Help?

- See [VERCEL_ENV_SETUP.md](./VERCEL_ENV_SETUP.md) for detailed Vercel setup
- See [GOOGLE_OAUTH_SETUP.md](./GOOGLE_OAUTH_SETUP.md) for OAuth configuration
- See [FIX_REDIRECT_URI.md](./FIX_REDIRECT_URI.md) for redirect URI troubleshooting
