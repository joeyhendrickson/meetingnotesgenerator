import { NextRequest, NextResponse } from 'next/server';
import { getGoogleDriveClient, getFileContent } from '@/lib/google-drive';
import { extractTextFromDocument } from '@/lib/document-processor';

const MAX_PREVIEW_SLICE = 8000;

function sliceForPreview(text: string, fileId: string, title: string) {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const chunks: Array<{
    id: string;
    chunkIndex: number;
    text: string;
    score: number;
    title: string;
  }> = [];

  let start = 0;
  let idx = 0;
  while (start < trimmed.length) {
    const slice = trimmed.slice(start, start + MAX_PREVIEW_SLICE).trim();
    if (slice.length > 0) {
      chunks.push({
        id: `${fileId}-preview-${idx}`,
        chunkIndex: idx,
        text: slice,
        score: 0,
        title: title || 'Document',
      });
      idx += 1;
    }
    start += MAX_PREVIEW_SLICE;
  }

  return chunks;
}

export async function POST(request: NextRequest) {
  try {
    const { fileId } = await request.json();

    if (!fileId) {
      return NextResponse.json(
        { error: 'File ID is required' },
        { status: 400 }
      );
    }

    const drive = await getGoogleDriveClient();
    const meta = await drive.files.get({
      fileId,
      fields: 'id, name, mimeType',
    });

    const mimeType = meta.data.mimeType || 'application/octet-stream';
    const fileName = meta.data.name || 'document';

    const buffer = await getFileContent(fileId, mimeType);
    const text = await extractTextFromDocument(buffer, mimeType, fileName);

    if (!text || text.trim().length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No readable text found in this file.',
        chunks: [],
        fileId,
        chunkCount: 0,
      });
    }

    const chunks = sliceForPreview(text, fileId, fileName);

    return NextResponse.json({
      success: true,
      chunks,
      fileId,
      chunkCount: chunks.length,
    });
  } catch (error) {
    console.error('Document preview API error:', error);
    return NextResponse.json(
      { error: 'Failed to load document preview' },
      { status: 500 }
    );
  }
}
