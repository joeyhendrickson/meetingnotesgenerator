import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import type { MeetingNotesStructured } from './meeting-notes-types';

function h1(text: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun({ text: text.slice(0, 32000), bold: true })],
  });
}

function h2(text: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    children: [new TextRun({ text: text.slice(0, 32000), bold: true })],
  });
}

function metaLine(label: string, value: string) {
  return new Paragraph({
    children: [
      new TextRun({ text: `${label}: `, bold: true }),
      new TextRun({ text: value.slice(0, 32000) }),
    ],
  });
}

function bulletParagraph(text: string) {
  return new Paragraph({
    children: [new TextRun({ text: `• ${text.slice(0, 32000)}` })],
  });
}

function bodyParagraph(text: string) {
  return new Paragraph({
    children: [new TextRun({ text: text.slice(0, 32000) })],
  });
}

function spacer() {
  return new Paragraph({ children: [new TextRun({ text: ' ' })] });
}

function bulletList(items: string[], emptyLabel: string) {
  const trimmed = items.map((s) => String(s || '').trim()).filter(Boolean);
  if (trimmed.length === 0) {
    return [new Paragraph({ children: [new TextRun({ text: emptyLabel })] })];
  }
  return trimmed.map((t) => bulletParagraph(t));
}

/**
 * Word document: title, date, byline, then Action items → Decisions → Risks → Assumptions → Outline.
 */
export async function buildMeetingNotesDocx(
  data: MeetingNotesStructured,
  authorLine: string
): Promise<Buffer> {
  const children: Paragraph[] = [];

  children.push(h1(data.meetingTitle || 'Meeting'));
  children.push(metaLine('Date', data.meetingDate || '(not stated in transcript)'));
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: 'Meeting notes by ', bold: true }),
        new TextRun({ text: authorLine.slice(0, 32000) }),
      ],
    })
  );
  children.push(spacer());

  children.push(h1('Action items'));
  children.push(...bulletList(data.actionItems || [], '(None identified.)'));
  children.push(spacer());

  children.push(h1('Decisions'));
  children.push(
    ...bulletList(
      data.decisions || [],
      '(No explicit decisions identified in the transcript.)'
    )
  );
  children.push(spacer());

  children.push(h1('Risks'));
  children.push(
    ...bulletList(data.risks || [], '(No risks or concerns called out in the transcript.)')
  );
  children.push(spacer());

  children.push(h1('Assumptions'));
  children.push(
    ...bulletList(
      data.assumptions || [],
      '(No assumptions inferred from the discussion.)'
    )
  );
  children.push(spacer());

  children.push(h1('Outline of the meeting'));
  const outline = Array.isArray(data.outline) ? data.outline : [];
  if (outline.length === 0) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: 'No outline segments were produced. Re-run generation or review the transcript length.',
          }),
        ],
      })
    );
  } else {
    for (const part of outline) {
      const title = String(part?.title || 'Section').trim() || 'Section';
      const summary = String(part?.summary || '').trim();
      children.push(h2(title));
      if (summary) {
        children.push(bodyParagraph(summary));
      } else {
        children.push(
          new Paragraph({ children: [new TextRun({ text: '(No summary for this segment.)' })] })
        );
      }
      children.push(spacer());
    }
  }

  const doc = new Document({
    sections: [{ properties: {}, children }],
  });

  return await Packer.toBuffer(doc);
}
