import { NextRequest, NextResponse } from 'next/server';
import { chatCompletion } from '@/lib/openai';

export async function POST(request: NextRequest) {
  try {
    console.log('Fill section API called');
    const body = await request.json();
    const { sectionTitle, sectionContent, projectPrompt, contextualDocuments } = body;
    
    console.log('Request data:', {
      sectionTitle,
      sectionContentLength: sectionContent?.length || 0,
      projectPromptLength: projectPrompt?.length || 0,
      contextualDocsCount: contextualDocuments?.length || 0,
    });

    if (!sectionTitle || !projectPrompt) {
      return NextResponse.json(
        { error: 'Section title and project prompt are required' },
        { status: 400 }
      );
    }

    let context = '';
    if (contextualDocuments && contextualDocuments.length > 0) {
      const contextualText = contextualDocuments
        .map((doc: { content: string; name: string }) => `[${doc.name}]:\n${doc.content}`)
        .join('\n\n---\n\n');
      context = `Additional context from uploaded documents:\n${contextualText}`;
    }

    // Generate content for this section
    const fillPrompt = `Fill in the following section of a project management document.

Section Title: ${sectionTitle}
Current Section Content: ${sectionContent || '(empty)'}

Project Description:
${projectPrompt}

Supporting context (uploads only):
${context || '(none — use the project description and section details.)'}

Generate appropriate content for this section that:
- Aligns with the project description
- Is specific, professional, and relevant
- Fits naturally into a project management document
- Maintains consistency with the section title/heading
- Is comprehensive but concise

Return only the filled content for this section, without repeating the section title.`;

    console.log('Calling OpenAI to generate content...');
    const filledContent = await chatCompletion(
      [
        {
          role: 'system',
          content: 'You are filling in sections of a project management document. Generate content that is specific, professional, and aligned with the project goals.',
        },
        {
          role: 'user',
          content: fillPrompt,
        },
      ],
      context.trim() ? context : undefined,
      { temperature: 0.5, preserveSystemMessage: true }
    );

    console.log('Content generated successfully, length:', filledContent.length);

    return NextResponse.json({
      success: true,
      filledContent: filledContent.trim(),
    });
  } catch (error) {
    console.error('❌ Section fill error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error('Error details:', { errorMessage, errorStack });
    
    return NextResponse.json(
      { 
        error: 'Failed to fill section', 
        details: errorMessage,
        ...(process.env.NODE_ENV === 'development' && { stack: errorStack })
      },
      { status: 500 }
    );
  }
}

