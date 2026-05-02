import { NextRequest, NextResponse } from 'next/server';
import { getGoogleDriveClient, getFileContent } from '@/lib/google-drive';
import { extractTextFromDocument } from '@/lib/document-processor';
import { chatCompletion } from '@/lib/openai';
import {
  isMeetingTranscriptDriveFile,
  MEETING_TRANSCRIPT_CHAT_MAX_FILES,
} from '@/lib/meeting-transcript-files';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

const MAX_COMBINED_CHARS = 120_000;

function stripAssistantFormatting(text: string) {
  let response = text.replace(/^#{1,6}\s+/gm, '');
  response = response.replace(/\*\*([^*]+)\*\*/g, '$1');
  response = response.replace(/\*([^*]+)\*/g, '$1');
  response = response.replace(/__([^_]+)__/g, '$1');
  response = response.replace(/_([^_]+)_/g, '$1');
  response = response.replace(/```[\s\S]*?```/g, '');
  response = response.replace(/`([^`]+)`/g, '$1');
  response = response.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  response = response.replace(/^[\s]*[-*+]\s+/gm, '');
  response = response.replace(/^\d+\.\s+/gm, '');
  response = response.replace(/\n{3,}/g, '\n\n');
  return response.trim();
}

export async function POST(request: NextRequest) {
  try {
    const { message, history = [], fileIds: rawFileIds } = await request.json();

    if (!message || typeof message !== 'string' || !message.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    if (!Array.isArray(rawFileIds) || rawFileIds.length === 0) {
      return NextResponse.json(
        { error: 'Select at least one meeting transcript in the Transcript summaries tab.' },
        { status: 400 }
      );
    }

    const fileIds = Array.from(
      new Set(rawFileIds.map((id: unknown) => String(id || '').trim()).filter(Boolean))
    );
    if (fileIds.length > MEETING_TRANSCRIPT_CHAT_MAX_FILES) {
      return NextResponse.json(
        { error: `Select at most ${MEETING_TRANSCRIPT_CHAT_MAX_FILES} transcripts for this chat.` },
        { status: 400 }
      );
    }

    const drive = await getGoogleDriveClient();
    const parts: string[] = [];
    const sources: Array<{
      id: string;
      title: string;
      text: string;
      score: number;
      fileId: string;
      chunkIndex: number;
    }> = [];

    let totalLen = 0;

    for (const fileId of fileIds) {
      const meta = await drive.files.get({
        fileId,
        fields: 'id, name, mimeType',
      });
      const fileName = meta.data.name || 'Transcript';
      const mimeType = meta.data.mimeType || undefined;

      if (!isMeetingTranscriptDriveFile(fileName, mimeType)) {
        return NextResponse.json(
          {
            error: `File "${fileName}" is not an allowed transcript for this chat (use .doc/.docx; not generated summaries).`,
          },
          { status: 400 }
        );
      }

      const buffer = await getFileContent(fileId, mimeType);
      const text = await extractTextFromDocument(
        buffer,
        mimeType || 'application/octet-stream',
        fileName
      );
      const trimmed = (text || '').trim();
      if (trimmed.length < 20) {
        return NextResponse.json(
          { error: `Could not read enough text from "${fileName}".` },
          { status: 400 }
        );
      }

      const header = `--- Transcript: ${fileName} (Drive file id ${fileId}) ---\n`;
      const remaining = MAX_COMBINED_CHARS - totalLen - header.length - 2;
      if (remaining < 200) {
        parts.push(`${header}[Further transcript text omitted: context length limit reached.]\n`);
        sources.push({
          id: fileId,
          title: fileName,
          text: trimmed.slice(0, 240),
          score: 1,
          fileId,
          chunkIndex: 0,
        });
        break;
      }

      let body = trimmed;
      if (body.length > remaining) {
        body = `${body.slice(0, remaining)}\n\n[This file was truncated to fit the context window.]`;
      }
      parts.push(`${header}${body}\n`);
      totalLen += header.length + body.length + 1;

      sources.push({
        id: fileId,
        title: fileName,
        text: trimmed.slice(0, 280),
        score: 1,
        fileId,
        chunkIndex: 0,
      });
    }

    const context = parts.join('\n');

    const messages = history.map((msg: { role: string; content: string }) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    }));
    messages.push({ role: 'user', content: message.trim() });

    let response = await chatCompletion(messages, context, {
      meetingTranscriptContext: true,
      temperature: 0.45,
    });
    response = stripAssistantFormatting(response);

    const confidenceScore = Math.min(0.92, 0.55 + Math.min(1, totalLen / 8000) * 0.2);

    return NextResponse.json({
      response,
      contextUsed: true,
      projectContextUsed: false,
      knowledgeBaseUsed: false,
      meetingTranscriptChat: true,
      sources,
      confidenceScore,
    });
  } catch (error) {
    console.error('Meeting transcript chat API error:', error);
    let errorMessage = error instanceof Error ? error.message : 'Failed to process message';
    if (errorMessage.includes('API key') || errorMessage.includes('must be set')) {
      errorMessage =
        'Configuration error: Missing API keys. Please check OPENAI_API_KEY and Google Drive credentials.';
    }
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
