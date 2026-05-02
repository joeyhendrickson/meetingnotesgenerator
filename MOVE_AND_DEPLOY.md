# MeetingNotesGenerator — deploy notes

The Next.js app for **MeetingNotesGenerator** lives in this directory: `MeetingNotesGenerator/meetingnotesgenerator/`.

## Local build

```bash
cd "/Users/josephhendrickson/Code Local Storage/Projects/MeetingNotesGenerator/meetingnotesgenerator"
npm install
npm run build
```

## Vercel

- Point the Vercel project at this folder (or the monorepo root with **Root Directory** = `meetingnotesgenerator`).
- Set `GOOGLE_REDIRECT_URI` and `NEXT_PUBLIC_APP_URL` to your real production host (for example `https://meetingnotesgenerator.vercel.app` if that matches your Vercel domain).

## Git

```bash
cd "/Users/josephhendrickson/Code Local Storage/Projects/MeetingNotesGenerator/meetingnotesgenerator"
git status
git push origin main
```

Moving only the app folder does not change the GitHub remote URL; update Vercel **Root Directory** if you relocate the repo.
