# Setting Up Environment Variables on Vercel

This guide will help you add all the environment variables from your `.env.local` file to your Vercel project.

## Step-by-Step Instructions

### Method 1: Using Vercel Dashboard (Recommended)

1. **Go to your Vercel project:**
   - Visit: https://vercel.com/dashboard
   - Find and click on your project: `meetingnotesgenerator` (or your project name)

2. **Navigate to Settings:**
   - Click on the **Settings** tab at the top of your project page

3. **Go to Environment Variables:**
   - In the left sidebar, click on **Environment Variables**

4. **Add Each Variable:**
   For each variable below, click **"Add New"** and enter:
   - **Key**: The variable name (exactly as shown)
   - **Value**: The value from your `.env.local` file
   - **Environment**: Select **Production**, **Preview**, and **Development** (or at minimum, select **Production**)

5. **Required Environment Variables:**

   ```
   OPENAI_API_KEY
   PINECONE_API_KEY
   PINECONE_ENVIRONMENT
   PINECONE_INDEX_NAME
   GOOGLE_CLIENT_ID
   GOOGLE_CLIENT_SECRET
   GOOGLE_REDIRECT_URI
   GOOGLE_REFRESH_TOKEN
   GOOGLE_DRIVE_FOLDER_ID
   NEXT_PUBLIC_APP_URL
   ```

6. **Important Notes:**
   - **GOOGLE_REDIRECT_URI**: Make sure this matches your Vercel production URL:
     - If your Vercel URL is `https://meetingnotesgenerator-xyz.vercel.app`, use:
       `https://meetingnotesgenerator-xyz.vercel.app/api/auth/google/callback`
     - OR use your custom domain if you have one set up
   
   - **NEXT_PUBLIC_APP_URL**: Should be your production Vercel URL:
     - Example: `https://meetingnotesgenerator-xyz.vercel.app`
     - OR your custom domain

7. **Save and Redeploy:**
   - After adding all variables, click **"Save"**
   - Go to the **Deployments** tab
   - Click the **"..."** menu on your latest deployment
   - Select **"Redeploy"** to apply the new environment variables

### Method 2: Using Vercel CLI

Alternatively, you can use the Vercel CLI to set environment variables:

```bash
# Set each variable (repeat for each one)
vercel env add OPENAI_API_KEY production
vercel env add PINECONE_API_KEY production
vercel env add PINECONE_ENVIRONMENT production
vercel env add PINECONE_INDEX_NAME production
vercel env add GOOGLE_CLIENT_ID production
vercel env add GOOGLE_CLIENT_SECRET production
vercel env add GOOGLE_REDIRECT_URI production
vercel env add GOOGLE_REFRESH_TOKEN production
vercel env add GOOGLE_DRIVE_FOLDER_ID production
vercel env add NEXT_PUBLIC_APP_URL production

# Pull environment variables to verify
vercel env pull .env.local
```

## What Each Variable Does

- **OPENAI_API_KEY**: Your OpenAI API key for AI-powered features
- **PINECONE_API_KEY**: Your Pinecone API key for vector database
- **PINECONE_ENVIRONMENT**: Your Pinecone environment/region
- **PINECONE_INDEX_NAME**: Name of your Pinecone index (default: `ultra-index`)
- **GOOGLE_CLIENT_ID**: Google OAuth client ID
- **GOOGLE_CLIENT_SECRET**: Google OAuth client secret
- **GOOGLE_REDIRECT_URI**: OAuth callback URL (must match Vercel URL)
- **GOOGLE_REFRESH_TOKEN**: Google OAuth refresh token
- **GOOGLE_DRIVE_FOLDER_ID**: Google Drive folder ID for document sync
- **NEXT_PUBLIC_APP_URL**: Your production app URL

## After Setup

Once all environment variables are added:

1. **Redeploy your project** (automatically triggers on next push, or manually redeploy)
2. **Test your application** to ensure everything works
3. **Verify Google OAuth** - Make sure the redirect URI in Google Cloud Console matches your Vercel URL

## Troubleshooting

- If you get OAuth errors, check that `GOOGLE_REDIRECT_URI` matches exactly (including https://)
- If Pinecone queries fail, verify `PINECONE_API_KEY` and `PINECONE_INDEX_NAME` are correct
- If OpenAI features don't work, check `OPENAI_API_KEY` is set correctly
- Remember to redeploy after adding/updating environment variables
