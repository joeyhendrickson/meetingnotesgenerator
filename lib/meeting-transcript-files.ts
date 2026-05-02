/** Max transcripts that can feed one `/api/chat/meeting-transcripts` request (context size). */
export const MEETING_TRANSCRIPT_CHAT_MAX_FILES = 15;

/**
 * Whether a Drive file is treated as a user transcript (not generated summaries).
 * Aligns with MeetingNotesWorkspace checkboxes and meeting-notes generate-batch.
 */
export function isMeetingTranscriptDriveFile(fileName: string, mimeType?: string | null): boolean {
  const n = fileName.toLowerCase();
  const m = (mimeType || '').toLowerCase();
  if (n.startsWith('meeting note summary')) return false;
  if (n.endsWith('.docx')) return true;
  if (n.endsWith('.doc')) return true;
  if (m.includes('wordprocessingml') || m.includes('msword')) return true;
  return false;
}
