import { NextRequest, NextResponse } from 'next/server';
import { chatCompletion, getEmbedding } from '@/lib/openai';
import { queryPinecone } from '@/lib/pinecone';

const MAX_PROJECT_CONTEXT_CHARS = 100_000;

export async function POST(request: NextRequest) {
  try {
    const { message, history = [], projectContext, projectFileName } = await request.json();

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

    // Get embedding for the user's message
    const queryEmbedding = await getEmbedding(message);

    // Query Pinecone for relevant context (with error handling)
    let matches: any[] = [];
    const topK = hasProject ? 10 : 5;
    try {
      matches = await queryPinecone(queryEmbedding, topK);
    } catch (pineconeError) {
      console.warn('Pinecone query failed, continuing without context:', pineconeError);
      // Continue without context if Pinecone fails
      matches = [];
    }

    // Calculate confidence: favor strong vector matches; boost when a substantive project doc is attached
    let confidenceScore = matches.length > 0 ? matches[0].score || 0 : 0;
    if (hasProject) {
      const len = truncatedProject.length;
      if (len >= 400) {
        confidenceScore = Math.max(confidenceScore, 0.82);
      } else if (len >= 80) {
        confidenceScore = Math.max(confidenceScore, 0.72);
      }
    }

    const vectorContext = matches
      .map((match) => {
        const metadata = match.metadata || {};
        return `[${metadata.title || 'Document'}]: ${metadata.text || match.id}`;
      })
      .join('\n\n');

    const projectBlock = hasProject
      ? `--- User uploaded project (${projectLabel}) ---\n${truncatedProject}\n--- End uploaded project ---`
      : '';

    const kbBlock =
      matches.length > 0
        ? `--- Knowledge base (vector database) ---\n${vectorContext}\n--- End knowledge base ---`
        : '';

    const context = [projectBlock, kbBlock].filter(Boolean).join('\n\n');

    const sources: Array<{
      id: string;
      title: string;
      text: string;
      score: number;
      fileId: string;
      chunkIndex: number;
    }> = [];

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

    sources.push(
      ...matches.map((match) => ({
        id: match.id,
        title: match.metadata?.title || 'Untitled Document',
        text: match.metadata?.text || '',
        score: match.score || 0,
        fileId: match.metadata?.fileId || '',
        chunkIndex: match.metadata?.chunkIndex || 0,
      }))
    );

    // Prepare chat history
    const messages = history.map((msg: { role: string; content: string }) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    }));

    // Add current message
    messages.push({
      role: 'user',
      content: message,
    });

    // Get response from OpenAI with context
    let response = await chatCompletion(messages, context || undefined, {
      projectMode: hasProject,
    });

    // Remove markdown formatting to make it more conversational and human
    // Remove headers (###, ##, #)
    response = response.replace(/^#{1,6}\s+/gm, '');
    // Remove bold/italic markdown (**text**, *text*, __text__, _text_)
    response = response.replace(/\*\*([^*]+)\*\*/g, '$1');
    response = response.replace(/\*([^*]+)\*/g, '$1');
    response = response.replace(/__([^_]+)__/g, '$1');
    response = response.replace(/_([^_]+)_/g, '$1');
    // Remove code blocks (```code``` and `code`)
    response = response.replace(/```[\s\S]*?```/g, '');
    response = response.replace(/`([^`]+)`/g, '$1');
    // Remove links ([text](url))
    response = response.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    // Remove list markers (-, *, +, 1.)
    response = response.replace(/^[\s]*[-*+]\s+/gm, '');
    response = response.replace(/^\d+\.\s+/gm, '');
    // Clean up extra whitespace
    response = response.replace(/\n{3,}/g, '\n\n');
    response = response.trim();

    return NextResponse.json({
      response,
      contextUsed: hasProject || matches.length > 0,
      projectContextUsed: hasProject,
      sources,
      confidenceScore,
    });
  } catch (error) {
    console.error('Chat API error:', error);
    
    // Provide more detailed error information
    let errorMessage = 'Failed to process chat message';
    if (error instanceof Error) {
      errorMessage = error.message;
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name,
      });
    }
    
    // Check for common issues
    if (errorMessage.includes('API key') || errorMessage.includes('must be set')) {
      errorMessage = 'Configuration error: Missing API keys. Please check your environment variables (OPENAI_API_KEY is required, PINECONE_API_KEY is optional but recommended).';
    } else if (errorMessage.includes('Pinecone')) {
      errorMessage = `Pinecone error: ${errorMessage}`;
    } else if (errorMessage.includes('OpenAI')) {
      errorMessage = `OpenAI error: ${errorMessage}`;
    }
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
