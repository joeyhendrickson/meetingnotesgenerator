import { NextRequest, NextResponse } from 'next/server';
import {
  syncDriveFolderToPinecone,
  isKnowledgeBaseConfigured,
  type KnowledgeScope,
} from '@/lib/knowledge-base';

export async function POST(request: NextRequest) {
  try {
    if (!isKnowledgeBaseConfigured()) {
      return NextResponse.json(
        {
          error:
            'Knowledge base is not configured. Set PINECONE_API_KEY and PINECONE_INDEX_NAME.',
        },
        { status: 503 }
      );
    }

    let fileId: string | undefined;
    let scope: KnowledgeScope = 'knowledge';
    try {
      const body = await request.json();
      if (typeof body?.fileId === 'string' && body.fileId.trim()) {
        fileId = body.fileId.trim();
      }
      if (body?.scope === 'section') {
        scope = 'section';
      }
    } catch {
      /* empty body */
    }

    const result = await syncDriveFolderToPinecone(
      fileId ? { fileId, scope } : { scope }
    );

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Google Drive sync / vectorize error:', error);
    const message = error instanceof Error ? error.message : 'Sync failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
