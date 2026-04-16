import { NextRequest, NextResponse } from 'next/server';
import { extractTextFromDocument } from '@/lib/document-processor';

const MAX_BYTES = 15 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 });
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'File is too large (maximum 15 MB).' }, { status: 400 });
    }

    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.doc') && !lower.endsWith('.docx')) {
      return NextResponse.json(
        { error: 'Please upload a Word document with a .doc or .docx extension.' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const mime = file.type || 'application/octet-stream';
    const text = await extractTextFromDocument(buffer, mime, file.name);
    const trimmed = text.trim();

    if (!trimmed) {
      return NextResponse.json(
        {
          error:
            'No readable text was found in this file. Try saving as .docx, or confirm the document is not empty or password-protected.',
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      success: true,
      fileName: file.name,
      text: trimmed,
      charCount: trimmed.length,
    });
  } catch (error) {
    console.error('Advisor project upload error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    );
  }
}
