# MeetingNotesGenerator

An AI-assisted app for meeting notes, documents, Blackboard Ultra guidance, and related workflows. Powered by OpenAI and Google Drive integration.

## Features

- **Transcript summaries (Google Drive)**: Upload `.doc` / `.docx` transcripts to Drive, select them in the app, and generate one structured Word summary per file (see `MEETING_NOTES_GOOGLE_SETUP.md`).
- **AI Chat Interface**: Interactive assistant (default model `gpt-5.4-mini`, override with `OPENAI_MODEL`)
- **Google Drive Integration**: OAuth 2.0 authentication for accessing and processing documents
- **Document Processing**: Upload project management templates and fill sections with AI assistance
- **Document Download**: Export completed documents with a single click

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy `.env.local.example` to `.env.local` and fill in your credentials:
```bash
cp .env.local.example .env.local
```

3. Configure your environment variables (see `.env.local.example` for details)

4. Run the development server:
```bash
npm run dev
```

5. Open [http://localhost:3003](http://localhost:3003) in your browser

## Environment Variables

See `.env.local.example` for all required environment variables.

**For detailed Google OAuth 2.0 setup instructions**, see [GOOGLE_OAUTH_SETUP.md](./GOOGLE_OAUTH_SETUP.md)

**To connect your Google Drive**, see [CONNECT_GOOGLE_DRIVE.md](./CONNECT_GOOGLE_DRIVE.md) - or use the "Google Drive Setup" tab in the application!

## Deployment

This application is configured for deployment on Vercel. Make sure to set all environment variables in your Vercel project settings.

## Project Structure

- `/app` - Next.js app router pages and components
- `/lib` - Utility functions and integrations (OpenAI, Google Drive)
- `/components` - React components
- `/api` - API routes for backend functionality

