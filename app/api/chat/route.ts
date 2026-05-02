import { NextRequest, NextResponse } from 'next/server';
import { chatCompletion } from '@/lib/openai';
import {
  isKnowledgeBaseConfigured,
  isScopeQueryable,
  queryKnowledgeBase,
  type KnowledgeScope,
} from '@/lib/knowledge-base';

const MAX_PROJECT_CONTEXT_CHARS = 100_000;
const MAX_RAG_CONTEXT_CHARS = 24_000;
const RAG_TOP_K = 5;

export async function POST(request: NextRequest) {
  try {
    const {
      message,
      history = [],
      projectContext,
      projectFileName,
      useKnowledgeBase = true,
      knowledgeScope = 'knowledge',
    } = await request.json();

    const ragScope: KnowledgeScope =
      knowledgeScope === 'section' ? 'section' : 'knowledge';

    if (!message) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    const hasProject =
      typeof projectContext === 'string' && projectContext.trim().length > 0;
    const projectLabel =
      typeof projectFileName === 'string' && projectFileName.trim().length > 0
        ? projectFileName.trim()
        : 'Uploaded project';

    let truncatedProject = '';
    if (hasProject) {
      const raw = projectContext.trim();
      truncatedProject =
        raw.length > MAX_PROJECT_CONTEXT_CHARS
          ? `${raw.slice(0, MAX_PROJECT_CONTEXT_CHARS)}\n\n[Project document truncated for length.]`
          : raw;
    }

    const projectBlock = hasProject
      ? `--- User uploaded project (${projectLabel}) ---\n${truncatedProject}\n--- End uploaded project ---`
      : '';

    let ragBlock = '';
    const ragHits =
      useKnowledgeBase !== false &&
      isKnowledgeBaseConfigured() &&
      isScopeQueryable(ragScope)
        ? await queryKnowledgeBase(message, RAG_TOP_K, ragScope)
        : [];

    if (ragHits.length > 0) {
      const pieces = ragHits.map(
        (h, i) =>
          `--- Excerpt ${i + 1}: ${h.title} (relevance ${(Math.min(1, Math.max(0, h.score)) * 100).toFixed(0)}%) ---\n${h.text}`
      );
      let joined = pieces.join('\n\n');
      if (joined.length > MAX_RAG_CONTEXT_CHARS) {
        joined = `${joined.slice(0, MAX_RAG_CONTEXT_CHARS)}\n\n[Retrieved context truncated.]`;
      }
      const ragHeader =
        ragScope === 'section'
          ? '--- Retrieved from section workspace documents (isolated index namespace; not the main knowledge base) ---'
          : '--- Retrieved from main knowledge base (synced Google Drive folder) ---';
      ragBlock = `${ragHeader}\n${joined}\n--- End retrieved excerpts ---`;
    }

    const context =
      [ragBlock, projectBlock].filter(Boolean).join('\n\n') || undefined;

    const sources: Array<{
      id: string;
      title: string;
      text: string;
      score: number;
      fileId: string;
      chunkIndex: number;
    }> = [];

    for (const h of ragHits) {
      sources.push({
        id: h.id,
        title: h.title,
        text: h.text.slice(0, 280),
        score: Math.min(1, Math.max(0, h.score)),
        fileId: h.fileId,
        chunkIndex: h.chunkIndex,
      });
    }

    if (hasProject) {
      sources.push({
        id: 'project-upload',
        title: `Project template: ${projectLabel}`,
        text: truncatedProject.slice(0, 280),
        score: 0.95,
        fileId: '',
        chunkIndex: 0,
      });
    }

    let confidenceScore = 0.5;
    if (ragHits.length > 0) {
      const avg =
        ragHits.reduce((s, h) => s + Math.min(1, Math.max(0, h.score)), 0) / ragHits.length;
      confidenceScore = 0.45 + avg * 0.45;
    }
    if (hasProject) {
      const len = truncatedProject.length;
      const projectPart = len >= 400 ? 0.82 : len >= 80 ? 0.72 : 0.55;
      confidenceScore =
        ragHits.length > 0 ? (confidenceScore + projectPart) / 2 : projectPart;
    }

    const messages = history.map((msg: { role: string; content: string }) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    }));

    messages.push({
      role: 'user',
      content: message,
    });

    let response = await chatCompletion(messages, context, {
      projectMode: hasProject,
    });

    response = response.replace(/^#{1,6}\s+/gm, '');
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
    response = response.trim();

    const contextUsed = hasProject || ragHits.length > 0;

    return NextResponse.json({
      response,
      contextUsed,
      projectContextUsed: hasProject,
      knowledgeBaseUsed: ragHits.length > 0,
      knowledgeScope: ragScope,
      sources,
      confidenceScore,
    });
  } catch (error) {
    console.error('Chat API error:', error);

    let errorMessage = 'Failed to process chat message';
    if (error instanceof Error) {
      errorMessage = error.message;
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name,
      });
    }

    if (errorMessage.includes('API key') || errorMessage.includes('must be set')) {
      errorMessage =
        'Configuration error: Missing API keys. Please check your environment variables (OPENAI_API_KEY is required).';
    } else if (errorMessage.includes('OpenAI')) {
      errorMessage = `OpenAI error: ${errorMessage}`;
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
