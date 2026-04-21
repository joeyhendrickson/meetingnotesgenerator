import { NextRequest, NextResponse } from 'next/server';
import { programPlanningCompletion } from '@/lib/openai';

function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n\n[…truncated…]`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const synthesizedPack =
      typeof body.synthesizedPack === 'string' ? body.synthesizedPack.trim() : '';
    const masterUploads: { name: string; text: string }[] = Array.isArray(body.masterUploads)
      ? body.masterUploads
      : [];
    const questionnaire = body.questionnaire && typeof body.questionnaire === 'object' ? body.questionnaire : {};

    if (!synthesizedPack && masterUploads.length === 0) {
      return NextResponse.json(
        {
          error:
            'Provide either generated planning content (from step 3) or at least one uploaded planning document for the Master Plan.',
        },
        { status: 400 }
      );
    }

    const qLines = Object.entries(questionnaire as Record<string, unknown>)
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join('\n');

    const uploadBlocks = masterUploads
      .map((u, i) => `--- Uploaded planning artifact ${i + 1}: ${u.name} ---\n${clip(u.text, 50000)}`)
      .join('\n\n');

    const userBlock = [
      '## Questionnaire\n',
      qLines || '(none)',
      '\n\n## Prior synthesized planning pack (if any)\n',
      synthesizedPack ? clip(synthesizedPack, 60000) : '(none — rely on uploads)',
      '\n\n## Additional uploaded planning documents\n',
      uploadBlocks || '(none)',
    ].join('');

    const system = `You are a program director producing a "Master Plan" review.
Return ONE JSON object with keys:
- "executiveSummary": string (markdown): concise program purpose, scope, and critical decisions implied by the inputs.
- "phases": array of { "phase": string, "benefits": string, "challenges": string, "risks": string, "budgetConsiderations": string } — one entry per major program phase you can infer (typically align with 4–8 phases). Be concrete and tie to the inputs where possible.
- "programWideRisks": string (markdown): cross-phase risks, dependencies, assumptions.
- "budgetOverview": string (markdown): rough budget considerations, categories of spend, and sensitivity to questionnaire constraints (no fabricated dollar totals unless clearly stated in inputs).

Output valid JSON only.`;

    const raw = await programPlanningCompletion(userBlock, {
      systemPrompt: `${system}\n\nRespond with JSON only, no surrounding commentary.`,
      temperature: 0.3,
      maxTokens: 7000,
      jsonMode: true,
    });

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { error: 'Model returned invalid JSON. Try shortening uploads or run again.' },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, data: parsed });
  } catch (error) {
    console.error('program-planning master-plan:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Master plan analysis failed' },
      { status: 500 }
    );
  }
}
