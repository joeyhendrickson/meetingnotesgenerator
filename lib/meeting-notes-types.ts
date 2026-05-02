export type MeetingDetailKind = 'assumption' | 'consideration' | 'decision' | 'risk';

export interface MeetingOutlineDetail {
  kind: MeetingDetailKind;
  text: string;
}

export interface MeetingOutlineSection {
  title: string;
  details: MeetingOutlineDetail[];
}

/** One part of the narrative outline (transcript-grounded summary). */
export interface MeetingOutlinePart {
  title: string;
  summary: string;
}

/**
 * Structured output for meeting note Word documents.
 * Decisions, risks, and assumptions are top-level sections; outline carries summarized flow.
 */
export interface MeetingNotesStructured {
  meetingTitle: string;
  /** Human-readable date line for the document header. */
  meetingDate: string;
  actionItems: string[];
  decisions: string[];
  risks: string[];
  assumptions: string[];
  outline: MeetingOutlinePart[];
}

export function isMeetingDetailKind(v: string): v is MeetingDetailKind {
  return v === 'assumption' || v === 'consideration' || v === 'decision' || v === 'risk';
}
