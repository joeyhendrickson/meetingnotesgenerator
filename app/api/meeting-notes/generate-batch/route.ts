import { NextRequest, NextResponse } from 'next/server';
import { getGoogleDriveClient, getFileContent, uploadFileToGoogleDrive } from '@/lib/google-drive';
import { extractTextFromDocument } from '@/lib/document-processor';
import { programPlanningCompletion } from '@/lib/openai';
import { buildMeetingNotesDocx } from '@/lib/meeting-notes-export';
import type {
  MeetingNotesStructured,
  MeetingOutlinePart,
  MeetingOutlineSection,
} from '@/lib/meeting-notes-types';
import { isMeetingDetailKind } from '@/lib/meeting-notes-types';
import { isMeetingTranscriptDriveFile } from '@/lib/meeting-transcript-files';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const TRANSCRIPT_MAX_CHARS = 120_000;
const DEFAULT_AUTHOR = 'Joseph Hendrickson';

function safeDriveFileName(s: string, max = 90) {
  return s
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function pickStringArray(o: Record<string, unknown>, key: string): string[] {
  const v = o[key];
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    if (typeof x === 'string' && x.trim()) out.push(x.trim());
  }
  return out;
}

function parseOutlineArray(raw: unknown): MeetingOutlinePart[] {
  if (!Array.isArray(raw)) return [];
  const out: MeetingOutlinePart[] = [];
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue;
    const r = x as Record<string, unknown>;
    const title = typeof r.title === 'string' ? r.title.trim() : '';
    const summary = typeof r.summary === 'string' ? r.summary.trim() : '';
    if (title || summary) {
      out.push({ title: title || 'Section', summary });
    }
  }
  return out;
}

function legacySections(o: Record<string, unknown>): MeetingOutlineSection[] {
  const sections: MeetingOutlineSection[] = [];
  if (!Array.isArray(o.sections)) return sections;
  for (const s of o.sections) {
    if (!s || typeof s !== 'object') continue;
    const rec = s as Record<string, unknown>;
    const st = typeof rec.title === 'string' && rec.title.trim() ? rec.title.trim() : 'Section';
    const details: MeetingOutlineSection['details'] = [];
    if (Array.isArray(rec.details)) {
      for (const d of rec.details) {
        if (!d || typeof d !== 'object') continue;
        const dr = d as Record<string, unknown>;
        const kind = typeof dr.kind === 'string' ? dr.kind.toLowerCase() : '';
        const text = typeof dr.text === 'string' ? dr.text.trim() : '';
        if (!text) continue;
        if (isMeetingDetailKind(kind)) {
          details.push({ kind, text });
        }
      }
    }
    sections.push({ title: st, details });
  }
  return sections;
}

function harvestFromLegacySections(
  sections: MeetingOutlineSection[],
  kind: 'decision' | 'risk' | 'assumption'
): string[] {
  const out: string[] = [];
  for (const s of sections) {
    for (const d of s.details || []) {
      if (d.kind === kind && d.text) out.push(d.text);
    }
  }
  return out;
}

function legacySectionsToOutline(sections: MeetingOutlineSection[]): MeetingOutlinePart[] {
  const out: MeetingOutlinePart[] = [];
  for (const s of sections) {
    const parts: string[] = [];
    for (const d of s.details || []) {
      const label =
        d.kind === 'consideration'
          ? 'Consideration'
          : d.kind === 'assumption'
            ? 'Assumption'
            : d.kind === 'decision'
              ? 'Decision'
              : d.kind === 'risk'
                ? 'Risk'
                : 'Note';
      parts.push(`${label}: ${d.text}`);
    }
    const summary = parts.join(' ');
    out.push({
      title: s.title,
      summary: summary || '(No detail captured for this segment.)',
    });
  }
  return out;
}

function normalizeStructured(raw: unknown, fallbackTitle: string): MeetingNotesStructured {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const title =
    typeof o.meetingTitle === 'string' && o.meetingTitle.trim() ? o.meetingTitle.trim() : fallbackTitle;
  const meetingDate =
    typeof o.meetingDate === 'string' && o.meetingDate.trim()
      ? o.meetingDate.trim()
      : 'Unclear from transcript';

  let actionItems = pickStringArray(o, 'actionItems');
  let decisions = pickStringArray(o, 'decisions');
  let risks = pickStringArray(o, 'risks');
  let assumptions = pickStringArray(o, 'assumptions');
  let outline = parseOutlineArray(o.outline);

  const legacy = legacySections(o);

  if (decisions.length === 0) {
    decisions = harvestFromLegacySections(legacy, 'decision');
  }
  if (risks.length === 0) {
    risks = harvestFromLegacySections(legacy, 'risk');
  }
  if (assumptions.length === 0) {
    const fromAssumption = harvestFromLegacySections(legacy, 'assumption');
    const considerations: string[] = [];
    for (const s of legacy) {
      for (const d of s.details || []) {
        if (d.kind === 'consideration' && d.text) considerations.push(d.text);
      }
    }
    assumptions = [...fromAssumption, ...considerations.map((t) => `[Consideration] ${t}`)];
  }
  if (outline.length === 0 && legacy.length > 0) {
    outline = legacySectionsToOutline(legacy);
  }

  return {
    meetingTitle: title,
    meetingDate,
    actionItems,
    decisions,
    risks,
    assumptions,
    outline,
  };
}

function buildAnalysisPrompt(transcript: string, authorDisplay: string) {
  const clipped =
    transcript.length > TRANSCRIPT_MAX_CHARS
      ? `${transcript.slice(0, TRANSCRIPT_MAX_CHARS)}\n\n[Transcript truncated for analysis.]`
      : transcript;

  return `You are producing structured meeting notes from a transcript.

The Word document will show "Meeting notes by ${authorDisplay}" — do not change that name in JSON.

Transcript:
---
${clipped}
---

Return ONLY valid JSON (no markdown fences) with this exact shape:
{
  "meetingTitle": "string — concise meeting title",
  "meetingDate": "string — e.g. April 15, 2026; infer from transcript or state unclear",
  "actionItems": ["string — concrete follow-ups; include owner/deadline when stated"],
  "decisions": ["string — explicit agreements or choices made in the meeting"],
  "risks": ["string — downsides, dependencies, concerns, or blockers mentioned"],
  "assumptions": ["string — things taken as true without proof, or implicit premises in the discussion"],
  "outline": [
    {
      "title": "string — subsection heading in chronological or logical order (e.g. Opening, Budget review)",
      "summary": "string — 2–6 sentences summarizing that part of the discussion, grounded in the transcript"
    }
  ]
}

Rules:
- actionItems: exhaustive where possible; use "(none)" only if truly none.
- decisions / risks / assumptions: separate lists; do not duplicate the same line across lists unless it genuinely fits two categories (prefer one best fit).
- outline: cover the full meeting in order; each summary must reflect what was actually said, not invented topics.
- Use enough outline segments to reflect major topic shifts (typically 4–12).`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const fileIds: unknown = body?.fileIds;
    const outputScope: 'knowledge' | 'section' =
      body?.outputScope === 'section' ? 'section' : 'knowledge';

    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      return NextResponse.json({ error: 'fileIds must be a non-empty array of Google Drive file IDs' }, { status: 400 });
    }
    if (fileIds.length > 25) {
      return NextResponse.json({ error: 'Maximum 25 files per batch' }, { status: 400 });
    }

    const authorDisplay =
      typeof process.env.MEETING_NOTES_AUTHOR === 'string' && process.env.MEETING_NOTES_AUTHOR.trim()
        ? process.env.MEETING_NOTES_AUTHOR.trim()
        : DEFAULT_AUTHOR;

    let outputFolderId: string | undefined;
    if (outputScope === 'section') {
      outputFolderId =
        (typeof process.env.MEETING_NOTES_SECTION_OUTPUT_FOLDER_ID === 'string' &&
          process.env.MEETING_NOTES_SECTION_OUTPUT_FOLDER_ID.trim()) ||
        (typeof process.env.GOOGLE_DRIVE_SECTION_FOLDER_ID === 'string' &&
          process.env.GOOGLE_DRIVE_SECTION_FOLDER_ID.trim());
      if (!outputFolderId) {
        return NextResponse.json(
          {
            error:
              'Section output folder not configured. Set GOOGLE_DRIVE_SECTION_FOLDER_ID or MEETING_NOTES_SECTION_OUTPUT_FOLDER_ID.',
          },
          { status: 400 }
        );
      }
    } else {
      outputFolderId =
        (typeof process.env.MEETING_NOTES_OUTPUT_FOLDER_ID === 'string' &&
          process.env.MEETING_NOTES_OUTPUT_FOLDER_ID.trim()) ||
        process.env.GOOGLE_DRIVE_FOLDER_ID?.trim();
      if (!outputFolderId) {
        return NextResponse.json(
          { error: 'Set GOOGLE_DRIVE_FOLDER_ID or MEETING_NOTES_OUTPUT_FOLDER_ID for summary uploads.' },
          { status: 500 }
        );
      }
    }

    const drive = await getGoogleDriveClient();
    const results: Array<{
      fileId: string;
      fileName?: string;
      success: boolean;
      skipped?: boolean;
      summaryFileId?: string;
      summaryFileName?: string;
      error?: string;
    }> = [];

    for (const id of fileIds) {
      if (typeof id !== 'string' || !id.trim()) continue;
      const fileId = id.trim();

      try {
        const meta = await drive.files.get({
          fileId,
          fields: 'id, name, mimeType',
        });
        const fileName = meta.data.name || 'transcript';
        const mimeType = meta.data.mimeType || undefined;

        if (!isMeetingTranscriptDriveFile(fileName, mimeType)) {
          results.push({
            fileId,
            fileName,
            success: false,
            skipped: true,
            error: 'Not a Word transcript (.doc/.docx) or file is reserved for summaries.',
          });
          continue;
        }

        const buffer = await getFileContent(fileId, mimeType);
        const text = await extractTextFromDocument(buffer, mimeType || 'application/octet-stream', fileName);

        if (!text || text.trim().length < 40) {
          results.push({
            fileId,
            fileName,
            success: false,
            error: 'Transcript text too short or could not be extracted.',
          });
          continue;
        }

        const jsonRaw = await programPlanningCompletion(buildAnalysisPrompt(text, authorDisplay), {
          systemPrompt:
            'You extract structured meeting notes as JSON only. Never include markdown code fences. Follow the user schema exactly.',
          jsonMode: true,
          temperature: 0.25,
          maxTokens: 12000,
        });

        let parsedJson: unknown;
        try {
          let raw = jsonRaw.trim();
          if (raw.startsWith('```')) {
            raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
          }
          parsedJson = JSON.parse(raw);
        } catch {
          results.push({
            fileId,
            fileName,
            success: false,
            error: 'Model returned invalid JSON.',
          });
          continue;
        }

        const fallbackTitle = fileName.replace(/\.[^/.]+$/, '') || 'Meeting';
        const structured = normalizeStructured(parsedJson, fallbackTitle);
        const docBuffer = await buildMeetingNotesDocx(structured, authorDisplay);

        const baseName = safeDriveFileName(structured.meetingTitle || fallbackTitle);
        const summaryName = `Meeting note summary – ${baseName}.docx`;

        const uploaded = await uploadFileToGoogleDrive(
          summaryName,
          docBuffer,
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          outputFolderId
        );

        results.push({
          fileId,
          fileName,
          success: true,
          summaryFileId: uploaded.fileId,
          summaryFileName: summaryName,
        });
      } catch (e) {
        results.push({
          fileId,
          success: false,
          error: e instanceof Error ? e.message : 'Unknown error',
        });
      }
    }

    return NextResponse.json({
      success: true,
      authorUsed: authorDisplay,
      outputFolderId,
      outputScope,
      results,
    });
  } catch (error) {
    console.error('meeting-notes generate-batch:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Batch generation failed' },
      { status: 500 }
    );
  }
}
