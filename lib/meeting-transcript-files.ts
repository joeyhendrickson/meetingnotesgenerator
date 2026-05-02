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
