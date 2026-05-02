# Google Drive + Google Cloud setup (Meeting Notes Generator)

This app uses **Google Drive** to store transcripts and uploaded **Word summary** files. Access is through **OAuth 2.0** (user consent), not a service account, unless you change the code.

You **do** use **Google Cloud Console** to create OAuth credentials and enable the Drive API.

---

## 1. Create a Google Cloud project

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Top bar: **Select a project** → **New project**.
3. Name it (e.g. `Meeting Notes Generator`) → **Create**.

---

## 2. Enable the Google Drive API

1. In the project, go to **APIs & Services** → **Library**.
2. Search for **Google Drive API** → **Enable**.

---

## 3. Configure the OAuth consent screen

1. **APIs & Services** → **OAuth consent screen**.
2. Choose **External** (unless you use Google Workspace and want Internal).
3. Fill **App name**, **User support email**, **Developer contact email**.
4. **Scopes**: add the scopes this app requests (already configured in code):

   - `https://www.googleapis.com/auth/drive.readonly`
   - `https://www.googleapis.com/auth/drive.file`

   In the consent screen editor, use **Add or remove scopes** and search for “Drive” to attach these.

5. **Test users**: while the app is in **Testing**, add your Google account as a test user so you can authorize without publishing.

6. Save. You can publish the app later if you need broader access (may require verification for sensitive scopes).

---

## 4. Create OAuth 2.0 Client ID (Web)

1. **APIs & Services** → **Credentials** → **Create credentials** → **OAuth client ID**.
2. Application type: **Web application**.
3. **Authorized redirect URIs** (must match your app exactly):

   - Local dev (this repo uses port **3003**):  
     `http://localhost:3003/api/auth/google/callback`
   - Production:  
     `https://YOUR-VERCEL-DOMAIN/api/auth/google/callback`

4. Create → copy **Client ID** and **Client Secret**.

---

## 5. Environment variables (`.env.local`)

Set at least:

| Variable | Purpose |
|----------|---------|
| `GOOGLE_CLIENT_ID` | Web client ID from step 4 |
| `GOOGLE_CLIENT_SECRET` | Client secret |
| `GOOGLE_REDIRECT_URI` | Must match one authorized redirect URI exactly (e.g. `http://localhost:3003/api/auth/google/callback`) |
| `GOOGLE_REFRESH_TOKEN` | From the OAuth flow (step 6) |
| `GOOGLE_DRIVE_FOLDER_ID` | Drive folder where transcripts are listed / summaries are written |

Optional:

| Variable | Purpose |
|----------|---------|
| `MEETING_NOTES_OUTPUT_FOLDER_ID` | If set, summary `.docx` files are uploaded here instead of `GOOGLE_DRIVE_FOLDER_ID` |
| `MEETING_NOTES_AUTHOR` | Display name on summaries (default: `Joseph Hendrickson`) |

---

## 6. Get a refresh token

1. Start the app: `npm run dev` (port **3003**).
2. Open `http://localhost:3003/api/auth/google` in the browser (or `GET` it and open the `authUrl` from the JSON response).
3. Sign in with the Google account that should own/read the Drive folder.
4. After consent, Google redirects to your callback URL with a `code`. This repo’s callback returns JSON with `refresh_token`.
5. Copy **`refresh_token`** into `.env.local` as `GOOGLE_REFRESH_TOKEN=...`.
6. Restart `npm run dev`.

If you do not get a `refresh_token`, revoke the app under [Google Account security](https://myaccount.google.com/permissions) and repeat with `prompt=consent` (already set in this codebase).

---

## 7. Drive folder for transcripts

1. In [Google Drive](https://drive.google.com), create a folder for transcripts (and summaries, unless you use a separate output folder).
2. Open the folder; the URL looks like:  
   `https://drive.google.com/drive/folders/THIS_IS_THE_FOLDER_ID`
3. Put `THIS_IS_THE_FOLDER_ID` in `.env.local` as `GOOGLE_DRIVE_FOLDER_ID`.

The same Google account that authorized the app should have access to this folder (your own folder is simplest).

---

## 8. Verify

1. **Transcript summaries** tab → **Refresh list** — you should see files in that folder.
2. Upload a `.doc` / `.docx` transcript → **Generate summaries** — a `Meeting note summary – ….docx` should appear in Drive (same folder or `MEETING_NOTES_OUTPUT_FOLDER_ID`).

---

## Notes

- **`.docx` vs `.doc`**: summaries are generated as **`.docx`** (modern Word). Transcripts can be **`.doc`** or **`.docx`**; both are read via the existing document parser.
- **Do you need Google Cloud?** Yes, for OAuth client + Drive API. You do **not** need a separate “Drive product” beyond enabling the API and credentials above.
- **Production**: add your Vercel callback URL to **Authorized redirect URIs**, set `GOOGLE_REDIRECT_URI` and `NEXT_PUBLIC_APP_URL` (if used elsewhere) to match production.
