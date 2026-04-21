import { NextRequest, NextResponse } from 'next/server';
import { programPlanningCompletion } from '@/lib/openai';

type Transcript = { name: string; text: string };
type NamedText = { name: string; text: string };

function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n\n[…truncated…]`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const transcripts: Transcript[] = Array.isArray(body.transcripts) ? body.transcripts : [];
    const presentation: NamedText | null = body.presentation || null;
    const programDocs: NamedText[] = Array.isArray(body.programDocs) ? body.programDocs : [];
    const questionnaire = body.questionnaire && typeof body.questionnaire === 'object' ? body.questionnaire : {};

    if (transcripts.length === 0 && !presentation && programDocs.length === 0) {
      return NextResponse.json(
        { error: 'Provide transcripts, a presentation, and/or program documents before synthesizing.' },
        { status: 400 }
      );
    }

    const tParts = transcripts.map(
      (t, i) => `--- Meeting transcript ${i + 1}: ${t.name} ---\n${clip(t.text, 45000)}`
    );
    const pPart = presentation
      ? `--- Presentation / deck: ${presentation.name} ---\n${clip(presentation.text, 45000)}`
      : '';
    const dParts = programDocs.map(
      (d, i) => `--- Program document ${i + 1}: ${d.name} ---\n${clip(d.text, 35000)}`
    );

    const qLines = Object.entries(questionnaire as Record<string, unknown>)
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join('\n');

    const userBlock = [
      '## Questionnaire (use to calibrate assumptions, risks, and budget bands)\n',
      qLines || '(none provided)',
      '\n\n## Intake content\n',
      tParts.join('\n\n'),
      pPart ? `\n\n${pPart}` : '',
      dParts.length ? `\n\n${dParts.join('\n\n')}` : '',
    ].join('');

    const system = `You synthesize program-level planning from meeting transcripts, slide decks, and contractual / governance documents.
Return a single JSON object with EXACTLY these keys (all string values except phaseOutline):
- "rolesResponsibilitiesMarkdown": A Roles & Responsibilities style matrix or structured list (RACI-style roles, key forums, decision rights). Use markdown headings and tables where helpful.
- "vendorDualApproachMarkdown": Two credible vendor / sourcing paths (e.g. single strategic partner vs. best-of-breed assembly), tradeoffs, and when each fits. Markdown.
- "ganttMermaid": A valid Mermaid "gantt" diagram string for major program phases (title, dateFormat, section, tasks with start/end or after keywords). Keep it readable (roughly 6–14 tasks).
- "planningParametersMarkdown": Bullet list of key planning parameters inferred or confirmed from the questionnaire and documents (scope, constraints, success measures).
- "phaseOutline": array of { "id": string, "title": string, "summary": string, "weeksHint": string } for 4–8 phases.

Do not include markdown outside JSON. Escape newlines inside JSON strings properly.`;

    const raw = await programPlanningCompletion(userBlock, {
      systemPrompt: `${system}\n\nYou output only valid JSON matching the schema above. No prose outside the JSON object.`,
      temperature: 0.35,
      maxTokens: 7500,
      jsonMode: true,
    });

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { error: 'Model returned invalid JSON. Try again with smaller uploads or fewer files.' },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, data: parsed, rawModel: raw });
  } catch (error) {
    console.error('program-planning synthesize:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Synthesis failed' },
      { status: 500 }
    );
  }
}
