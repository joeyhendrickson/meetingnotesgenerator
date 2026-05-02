import OpenAI from 'openai';

let openaiClient: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (openaiClient) {
    return openaiClient;
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OpenAI API key must be set');
  }

  openaiClient = new OpenAI({
    apiKey: apiKey,
  });

  return openaiClient;
}

export async function chatCompletion(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  context?: string,
  options?: {
    temperature?: number;
    preserveSystemMessage?: boolean;
    projectMode?: boolean;
    /** When true with context: answer only from provided meeting transcripts; do not invent meeting facts. */
    meetingTranscriptContext?: boolean;
  }
) {
  const client = getOpenAIClient();

  // Check if a system message is already in the messages array
  const hasSystemMessage = messages.some(msg => msg.role === 'system');

  const projectLead =
    options?.projectMode && context
      ? `The user is working inside a "project" with an uploaded template (for example a video script, storyboard, or slide outline with visual descriptions). The uploaded project defines structure, scenes, slides, or placeholders. When the user asks for narration, voiceover, or text per scene or slide, align output with the visuals and ordering already described in the uploaded document. Use general Blackboard Ultra knowledge where helpful, and say when something is not specified in their file.\n\n`
      : '';

  const baseTone =
    'IMPORTANT: Write in a natural, conversational tone. Do not use markdown formatting like ### headers, **bold**, *italic*, code blocks, or bullet points. Write as if you\'re speaking directly to the user in plain, human-friendly text.';

  const meetingTranscriptSystem =
    options?.meetingTranscriptContext && context
      ? `You are Meeting Notes Generator. The user selected meeting transcript(s) from Google Drive. Use ONLY the transcript text below to answer questions about what was discussed, decisions, action items, risks, attendees, dates, and names. If something is not in these transcripts, say clearly that the selected files do not cover it—do not invent meeting content or use outside knowledge to fill gaps about what happened in the meeting.\n\n${context}\n\n${baseTone}`
      : null;

  const systemMessage = hasSystemMessage && options?.preserveSystemMessage
    ? undefined
      : meetingTranscriptSystem
    ? meetingTranscriptSystem
      : context
    ? options?.projectMode
      ? `You are Meeting Notes Generator, an intelligent assistant. ${projectLead}Use the following combined context:\n\n${context}\n\nIf something is not covered in the context, say so briefly and use careful general reasoning. ${baseTone}`
      : `You are Meeting Notes Generator. Help with Blackboard Ultra and related topics using the following context:\n\n${context}\n\nIf the context doesn't contain relevant information, use your general knowledge but indicate when you're doing so.\n\n${baseTone}`
    : options?.projectMode
    ? `You are Meeting Notes Generator, helping with a structured project. ${baseTone}`
    : `You are Meeting Notes Generator. Provide helpful, accurate information about Blackboard Ultra, project management, meeting notes, and content updates.\n\n${baseTone}`;

  const allMessages = systemMessage 
    ? [{ role: 'system' as const, content: systemMessage }, ...messages]
    : messages;

  const model = process.env.OPENAI_MODEL || 'gpt-5.4-mini';
  
  const response = await client.chat.completions.create({
    model: model,
    messages: allMessages,
    temperature: options?.temperature ?? 0.7,
    // gpt-5.* requires max_completion_tokens; older chat models accept it too
    max_completion_tokens: 4000,
  });

  return response.choices[0]?.message?.content || '';
}

/** Long-form planning output; allows markdown and optional JSON mode for structured deliverables. */
export async function programPlanningCompletion(
  userContent: string,
  options?: {
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
    jsonMode?: boolean;
  }
): Promise<string> {
  const client = getOpenAIClient();
  const model = process.env.OPENAI_MODEL || 'gpt-5.4-mini';
  const system =
    options?.systemPrompt ||
    'You are an expert program and portfolio manager. Follow the user instructions precisely.';

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userContent },
    ],
    temperature: options?.temperature ?? 0.35,
    max_completion_tokens: options?.maxTokens ?? 7000,
    ...(options?.jsonMode ? { response_format: { type: 'json_object' as const } } : {}),
  });

  return response.choices[0]?.message?.content || '';
}

