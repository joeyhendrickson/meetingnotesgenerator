import { NextRequest, NextResponse } from 'next/server';
import { extractTextFromDocument } from '@/lib/document-processor';

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_TEXT_CHARS = 120_000;

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();

    const transcripts: { name: string; text: string }[] = [];
    let presentation: { name: string; text: string } | null = null;
    const programDocs: { name: string; text: string }[] = [];
    const masterDocuments: { name: string; text: string }[] = [];

    for (const [key, val] of Array.from(form.entries())) {
      if (!(val instanceof File) || val.size === 0) continue;
      if (val.size > MAX_FILE_BYTES) {
        return NextResponse.json(
          { error: `File "${val.name}" exceeds maximum size (20 MB).` },
          { status: 400 }
        );
      }

      const lower = val.name.toLowerCase();
      const isTranscript =
        key === 'transcript' ||
        key === 'transcripts' ||
        key.startsWith('transcript_');
      const isDeck = key === 'deck' || key === 'presentation';
      const isProgram =
        key === 'programDoc' ||
        key === 'programDocs' ||
        key.startsWith('programDoc_');
      const isMaster =
        key === 'masterDoc' || key === 'masterPlanDoc' || key.startsWith('masterDoc_');

      if (!isTranscript && !isDeck && !isProgram && !isMaster) continue;

      const allowed =
        lower.endsWith('.doc') ||
        lower.endsWith('.docx') ||
        lower.endsWith('.pptx') ||
        lower.endsWith('.pdf') ||
        lower.endsWith('.txt');

      if (!allowed) {
        return NextResponse.json(
          { error: `Unsupported file type for "${val.name}". Use .doc, .docx, .pptx, .pdf, or .txt.` },
          { status: 400 }
        );
      }

      const buffer = Buffer.from(await val.arrayBuffer());
      const mime = val.type || 'application/octet-stream';
      let text: string;
      try {
        text = await extractTextFromDocument(buffer, mime, val.name);
      } catch (e) {
        return NextResponse.json(
          { error: `Could not read "${val.name}": ${e instanceof Error ? e.message : 'Unknown error'}` },
          { status: 422 }
        );
      }

      const trimmed = text.trim().slice(0, MAX_TEXT_CHARS);
      if (!trimmed) {
        return NextResponse.json(
          { error: `No extractable text in "${val.name}".` },
          { status: 422 }
        );
      }

      if (isTranscript) {
        transcripts.push({ name: val.name, text: trimmed });
      } else if (isDeck) {
        if (presentation) {
          return NextResponse.json(
            { error: 'Upload at most one presentation deck per ingest request.' },
            { status: 400 }
          );
        }
        presentation = { name: val.name, text: trimmed };
      } else if (isProgram) {
        programDocs.push({ name: val.name, text: trimmed });
      } else if (isMaster) {
        masterDocuments.push({ name: val.name, text: trimmed });
      }
    }

    const intakeCount = transcripts.length + (presentation ? 1 : 0) + programDocs.length;
    const masterOnly = masterDocuments.length > 0 && intakeCount === 0;

    if (intakeCount === 0 && masterDocuments.length === 0) {
      return NextResponse.json(
        { error: 'Add at least one file (transcript, deck, program document, or master-plan artifact).' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      transcripts,
      presentation,
      programDocs,
      masterDocuments,
      masterOnly,
    });
  } catch (error) {
    console.error('program-planning ingest:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Ingest failed' },
      { status: 500 }
    );
  }
}
