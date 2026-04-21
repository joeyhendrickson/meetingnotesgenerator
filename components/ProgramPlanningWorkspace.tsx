'use client';

import { useCallback, useState } from 'react';

type NamedText = { name: string; text: string };

type Questionnaire = {
  programName: string;
  targetGoLive: string;
  budgetBand: string;
  teamSize: string;
  vendorCount: string;
  riskPosture: string;
  stakeholderGroups: string;
  extraNotes: string;
};

type Step = 'intake' | 'parameters' | 'outputs' | 'master';

const emptyQ = (): Questionnaire => ({
  programName: '',
  targetGoLive: '',
  budgetBand: '',
  teamSize: '',
  vendorCount: '',
  riskPosture: '',
  stakeholderGroups: '',
  extraNotes: '',
});

function MarkdownBlock({ content, title }: { content: string; title: string }) {
  if (!content?.trim()) return null;
  return (
    <div className="rounded-xl border-2 border-black bg-white overflow-hidden">
      <div className="px-4 py-2 bg-gray-100 border-b border-gray-200">
        <h3 className="text-sm font-bold text-gray-900">{title}</h3>
      </div>
      <div className="p-4 max-h-[420px] overflow-y-auto text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
        {content}
      </div>
    </div>
  );
}

export default function ProgramPlanningWorkspace() {
  const [step, setStep] = useState<Step>('intake');
  const [transcriptFiles, setTranscriptFiles] = useState<File[]>([]);
  const [deckFile, setDeckFile] = useState<File | null>(null);
  const [programFiles, setProgramFiles] = useState<File[]>([]);
  const [transcripts, setTranscripts] = useState<NamedText[]>([]);
  const [presentation, setPresentation] = useState<NamedText | null>(null);
  const [programDocs, setProgramDocs] = useState<NamedText[]>([]);
  const [questionnaire, setQuestionnaire] = useState<Questionnaire>(emptyQ);
  const [ingestError, setIngestError] = useState<string | null>(null);
  const [ingestBusy, setIngestBusy] = useState(false);
  const [synthBusy, setSynthBusy] = useState(false);
  const [synthError, setSynthError] = useState<string | null>(null);
  const [synthData, setSynthData] = useState<Record<string, unknown> | null>(null);
  const [masterFiles, setMasterFiles] = useState<File[]>([]);
  const [masterParsed, setMasterParsed] = useState<NamedText[]>([]);
  const [includeSynthInMaster, setIncludeSynthInMaster] = useState(true);
  const [masterBusy, setMasterBusy] = useState(false);
  const [masterError, setMasterError] = useState<string | null>(null);
  const [masterData, setMasterData] = useState<Record<string, unknown> | null>(null);

  const ingestIntake = useCallback(async () => {
    setIngestError(null);
    if (transcriptFiles.length === 0 && !deckFile && programFiles.length === 0) {
      setIngestError('Add at least one meeting transcript, a deck, or a program document.');
      return;
    }
    const fd = new FormData();
    transcriptFiles.forEach((f) => fd.append('transcript', f));
    if (deckFile) fd.append('deck', deckFile);
    programFiles.forEach((f) => fd.append('programDoc', f));
    setIngestBusy(true);
    try {
      const res = await fetch('/api/program-planning/ingest', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not read files');
      setTranscripts(data.transcripts || []);
      setPresentation(data.presentation || null);
      setProgramDocs(data.programDocs || []);
      setStep('parameters');
    } catch (e) {
      setIngestError(e instanceof Error ? e.message : 'Ingest failed');
    } finally {
      setIngestBusy(false);
    }
  }, [transcriptFiles, deckFile, programFiles]);

  const runSynthesize = useCallback(async () => {
    setSynthError(null);
    setSynthBusy(true);
    try {
      const res = await fetch('/api/program-planning/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcripts,
          presentation,
          programDocs,
          questionnaire,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Synthesis failed');
      setSynthData((data.data as Record<string, unknown>) || null);
      setStep('outputs');
    } catch (e) {
      setSynthError(e instanceof Error ? e.message : 'Synthesis failed');
    } finally {
      setSynthBusy(false);
    }
  }, [transcripts, presentation, programDocs, questionnaire]);

  const buildSynthesizedPackString = useCallback(() => {
    if (!synthData) return '';
    const parts: string[] = [];
    const r = synthData.rolesResponsibilitiesMarkdown;
    const v = synthData.vendorDualApproachMarkdown;
    const g = synthData.ganttMermaid;
    const p = synthData.planningParametersMarkdown;
    if (typeof r === 'string') parts.push('# Roles & Responsibilities\n\n' + r);
    if (typeof v === 'string') parts.push('# Vendor paths\n\n' + v);
    if (typeof g === 'string') parts.push('# Timeline (Mermaid)\n\n' + g);
    if (typeof p === 'string') parts.push('# Planning parameters\n\n' + p);
    const outline = synthData.phaseOutline;
    if (Array.isArray(outline)) {
      parts.push('# Phase outline\n\n' + JSON.stringify(outline, null, 2));
    }
    return parts.join('\n\n---\n\n');
  }, [synthData]);

  const runMasterPlan = useCallback(async () => {
    setMasterError(null);
    setMasterBusy(true);
    try {
      let masterUploads: NamedText[] = [];
      if (masterFiles.length > 0) {
        const fd = new FormData();
        masterFiles.forEach((f) => fd.append('masterDoc', f));
        const ingestRes = await fetch('/api/program-planning/ingest', { method: 'POST', body: fd });
        const ingestJson = await ingestRes.json().catch(() => ({}));
        if (!ingestRes.ok) throw new Error(ingestJson.error || 'Could not read master-plan files');
        masterUploads = ingestJson.masterDocuments || [];
        setMasterParsed(masterUploads);
      }

      const synthesizedPack =
        includeSynthInMaster && synthData ? buildSynthesizedPackString() : '';

      if (!synthesizedPack.trim() && masterUploads.length === 0) {
        throw new Error('Include the generated pack and/or add at least one upload.');
      }

      const res = await fetch('/api/program-planning/master-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          synthesizedPack,
          masterUploads,
          questionnaire,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Master plan failed');
      setMasterData((data.data as Record<string, unknown>) || null);
    } catch (e) {
      setMasterError(e instanceof Error ? e.message : 'Master plan failed');
    } finally {
      setMasterBusy(false);
    }
  }, [
    masterFiles,
    includeSynthInMaster,
    synthData,
    questionnaire,
    buildSynthesizedPackString,
  ]);

  const phaseOutline = Array.isArray(synthData?.phaseOutline) ? synthData?.phaseOutline : [];

  const steps: { id: Step; label: string; hint: string }[] = [
    { id: 'intake', label: '1. Intake', hint: 'Transcripts, deck, program files' },
    { id: 'parameters', label: '2. Parameters', hint: 'Scope & constraints' },
    { id: 'outputs', label: '3. Planning pack', hint: 'R&R, vendors, timeline' },
    { id: 'master', label: '4. Master Plan', hint: 'Consolidate & analyze' },
  ];

  return (
    <div className="flex flex-col gap-6 min-h-[680px]">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Program planning studio</h2>
        <p className="text-gray-600 mt-2 text-sm leading-relaxed max-w-3xl">
          Combine meeting transcripts, a PowerPoint deck, and program artifacts (SOW, RACI, charter, and similar
          inputs). Capture planning parameters, generate structured program documents—including roles, vendor strategy
          options, and a phase timeline—and then assemble a Master Plan with phase-level benefits, challenges, risks,
          and budget considerations.
        </p>
      </div>

      <nav className="flex flex-wrap gap-2" aria-label="Program planning steps">
        {steps.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setStep(s.id)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-all ${
              step === s.id
                ? 'bg-black text-white border-black shadow-md'
                : 'bg-white text-gray-800 border-gray-300 hover:border-black'
            }`}
          >
            <span className="block">{s.label}</span>
            <span className={`block text-xs font-normal mt-0.5 ${step === s.id ? 'text-gray-200' : 'text-gray-500'}`}>
              {s.hint}
            </span>
          </button>
        ))}
      </nav>

      {step === 'intake' && (
        <div className="space-y-6">
          <div className="grid md:grid-cols-3 gap-4">
            <div className="rounded-xl border-2 border-gray-300 p-4 bg-gray-50">
              <h3 className="font-semibold text-gray-900 mb-2">Meeting transcripts</h3>
              <p className="text-xs text-gray-600 mb-3">
                Multiple Word documents (.doc / .docx). We read them together for context.
              </p>
              <input
                type="file"
                multiple
                accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="text-sm w-full"
                onChange={(e) => setTranscriptFiles(Array.from(e.target.files || []))}
              />
              {transcriptFiles.length > 0 && (
                <p className="text-xs text-gray-700 mt-2">{transcriptFiles.length} file(s) selected</p>
              )}
            </div>
            <div className="rounded-xl border-2 border-gray-300 p-4 bg-gray-50">
              <h3 className="font-semibold text-gray-900 mb-2">Presentation deck</h3>
              <p className="text-xs text-gray-600 mb-3">One PowerPoint (.pptx). Legacy .ppt is not supported—save as .pptx.</p>
              <input
                type="file"
                accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                className="text-sm w-full"
                onChange={(e) => setDeckFile(e.target.files?.[0] || null)}
              />
              {deckFile && <p className="text-xs text-gray-700 mt-2">{deckFile.name}</p>}
            </div>
            <div className="rounded-xl border-2 border-gray-300 p-4 bg-gray-50">
              <h3 className="font-semibold text-gray-900 mb-2">Program documents</h3>
              <p className="text-xs text-gray-600 mb-3">SOW, RACI, charter, vendor briefs, etc. (.doc, .docx, .pdf, .txt).</p>
              <input
                type="file"
                multiple
                accept=".doc,.docx,.pdf,.txt,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf"
                className="text-sm w-full"
                onChange={(e) => setProgramFiles(Array.from(e.target.files || []))}
              />
              {programFiles.length > 0 && (
                <p className="text-xs text-gray-700 mt-2">{programFiles.length} file(s) selected</p>
              )}
            </div>
          </div>
          {ingestError && <p className="text-sm text-red-600">{ingestError}</p>}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={ingestBusy}
              onClick={ingestIntake}
              className="px-6 py-3 bg-black text-white font-semibold rounded-xl border-2 border-black hover:opacity-90 disabled:opacity-50"
            >
              {ingestBusy ? 'Reading files…' : 'Parse & continue'}
            </button>
            <p className="text-xs text-gray-500 self-center max-w-md">
              After parsing, you will confirm planning parameters. Large files are truncated server-side to stay within model limits.
            </p>
          </div>
        </div>
      )}

      {step === 'parameters' && (
        <div className="space-y-4 max-w-3xl">
          <p className="text-sm text-gray-600">
            These answers tune assumptions, risk posture, and budget bands in the generated planning pack.
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            {(
              [
                ['programName', 'Program name'],
                ['targetGoLive', 'Target go-live or milestone window'],
                ['budgetBand', 'Budget band (e.g. tight / moderate / flexible)'],
                ['teamSize', 'Core team size (approx.)'],
                ['vendorCount', 'Vendors or workstreams in play'],
                ['riskPosture', 'Risk posture (e.g. risk-averse / balanced / aggressive)'],
                ['stakeholderGroups', 'Key stakeholder groups'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block text-sm">
                <span className="font-medium text-gray-800">{label}</span>
                <input
                  className="mt-1 w-full border-2 border-gray-300 rounded-lg px-3 py-2 text-sm"
                  value={questionnaire[key]}
                  onChange={(e) => setQuestionnaire((q) => ({ ...q, [key]: e.target.value }))}
                />
              </label>
            ))}
          </div>
          <label className="block text-sm">
            <span className="font-medium text-gray-800">Extra notes</span>
            <textarea
              className="mt-1 w-full border-2 border-gray-300 rounded-lg px-3 py-2 text-sm min-h-[100px]"
              value={questionnaire.extraNotes}
              onChange={(e) => setQuestionnaire((q) => ({ ...q, extraNotes: e.target.value }))}
              placeholder="Constraints, must-haves, integrations, compliance, etc."
            />
          </label>
          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="button"
              onClick={() => setStep('intake')}
              className="px-4 py-2 border-2 border-gray-400 rounded-xl font-medium text-gray-800 hover:bg-gray-50"
            >
              Back to intake
            </button>
            <button
              type="button"
              disabled={synthBusy}
              onClick={runSynthesize}
              className="px-6 py-3 bg-black text-white font-semibold rounded-xl border-2 border-black hover:opacity-90 disabled:opacity-50"
            >
              {synthBusy ? 'Generating…' : 'Generate planning pack'}
            </button>
          </div>
          {synthError && <p className="text-sm text-red-600">{synthError}</p>}
          <div className="text-xs text-gray-500 border-t pt-3">
            Parsed: {transcripts.length} transcript(s)
            {presentation ? ', 1 deck' : ''}, {programDocs.length} program file(s).
          </div>
        </div>
      )}

      {step === 'outputs' && (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setStep('parameters')}
              className="px-4 py-2 border-2 border-gray-400 rounded-xl text-sm font-medium"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => setStep('master')}
              className="px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-semibold"
            >
              Continue to Master Plan
            </button>
          </div>

          {Array.isArray(phaseOutline) && phaseOutline.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-gray-900 mb-3">Phase timeline (overview)</h3>
              <div className="flex flex-wrap gap-2 items-stretch">
                {(phaseOutline as { title?: string; weeksHint?: string; summary?: string }[]).map((ph, i) => (
                  <div
                    key={i}
                    className="flex-1 min-w-[140px] max-w-[220px] rounded-lg border-2 border-black p-3 bg-white shadow-sm"
                  >
                    <p className="text-xs font-bold text-gray-500">Phase {i + 1}</p>
                    <p className="text-sm font-semibold text-gray-900 mt-1">{ph.title || 'Untitled'}</p>
                    {ph.weeksHint && <p className="text-xs text-gray-600 mt-1">{ph.weeksHint}</p>}
                    {ph.summary && (
                      <p className="text-xs text-gray-700 mt-2 line-clamp-4">{ph.summary}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid lg:grid-cols-2 gap-4">
            <MarkdownBlock
              title="Roles & responsibilities"
              content={typeof synthData?.rolesResponsibilitiesMarkdown === 'string' ? synthData.rolesResponsibilitiesMarkdown : ''}
            />
            <MarkdownBlock
              title="Vendor dual-path options"
              content={typeof synthData?.vendorDualApproachMarkdown === 'string' ? synthData.vendorDualApproachMarkdown : ''}
            />
            <MarkdownBlock
              title="Planning parameters"
              content={typeof synthData?.planningParametersMarkdown === 'string' ? synthData.planningParametersMarkdown : ''}
            />
            <div className="rounded-xl border-2 border-black bg-gray-950 text-gray-100 overflow-hidden">
              <div className="px-4 py-2 bg-gray-900 border-b border-gray-700">
                <h3 className="text-sm font-bold">Gantt (Mermaid)</h3>
                <p className="text-xs text-gray-400 mt-1">
                  Paste into{' '}
                  <a href="https://mermaid.live" className="underline text-white" target="_blank" rel="noreferrer">
                    mermaid.live
                  </a>{' '}
                  to render, or embed in Confluence / Notion Mermaid blocks.
                </p>
              </div>
              <pre className="p-4 text-xs overflow-x-auto max-h-[360px] font-mono leading-relaxed">
                {typeof synthData?.ganttMermaid === 'string' ? synthData.ganttMermaid : '—'}
              </pre>
            </div>
          </div>
        </div>
      )}

      {step === 'master' && (
        <div className="space-y-6">
          <p className="text-sm text-gray-700 max-w-3xl">
            Upload finalized planning artifacts (edited Word/PDF outputs, steering slides, or a merged narrative). We
            combine them with the generated pack (optional) to produce a Master Plan: executive read, per-phase benefits
            and challenges, risks, and budget considerations.
          </p>
          <label className="flex items-start gap-3 text-sm cursor-pointer max-w-xl">
            <input
              type="checkbox"
              className="mt-1"
              checked={includeSynthInMaster}
              onChange={(e) => setIncludeSynthInMaster(e.target.checked)}
              disabled={!synthData}
            />
            <span className="text-gray-800">
              <span className="font-semibold">Include generated planning pack</span> in the Master Plan prompt
              {!synthData && <span className="text-gray-500"> (generate in step 3 first)</span>}
            </span>
          </label>
          <div className="rounded-xl border-2 border-dashed border-gray-400 p-4 bg-gray-50 max-w-xl">
            <h3 className="font-semibold text-gray-900 text-sm mb-2">Upload planning outputs</h3>
            <input
              type="file"
              multiple
              accept=".doc,.docx,.pdf,.txt,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf"
              className="text-sm w-full"
              onChange={(e) => setMasterFiles(Array.from(e.target.files || []))}
            />
            {masterFiles.length > 0 && (
              <p className="text-xs text-gray-700 mt-2">{masterFiles.length} file(s) selected</p>
            )}
          </div>
          {masterError && <p className="text-sm text-red-600">{masterError}</p>}
          <button
            type="button"
            disabled={
              masterBusy ||
              (!(includeSynthInMaster && synthData) && masterFiles.length === 0)
            }
            onClick={runMasterPlan}
            className="px-6 py-3 bg-black text-white font-semibold rounded-xl border-2 border-black disabled:opacity-50"
          >
            {masterBusy ? 'Building Master Plan…' : 'Build Master Plan'}
          </button>
          <p className="text-xs text-gray-500">
            You can build from generated content alone, uploads alone, or both. At least one source is required.
          </p>

          {masterData && (
            <div className="space-y-6 border-t-2 border-gray-200 pt-6">
              <h3 className="text-lg font-bold text-gray-900">Master Plan analysis</h3>
              <MarkdownBlock
                title="Executive summary"
                content={typeof masterData.executiveSummary === 'string' ? masterData.executiveSummary : ''}
              />
              <MarkdownBlock
                title="Budget overview"
                content={typeof masterData.budgetOverview === 'string' ? masterData.budgetOverview : ''}
              />
              <MarkdownBlock
                title="Program-wide risks"
                content={typeof masterData.programWideRisks === 'string' ? masterData.programWideRisks : ''}
              />
              {Array.isArray(masterData.phases) && (
                <div>
                  <h4 className="text-sm font-bold text-gray-900 mb-3">Per-phase view</h4>
                  <div className="grid md:grid-cols-2 gap-4">
                    {(masterData.phases as Record<string, string>[]).map((ph, i) => (
                      <div key={i} className="rounded-xl border-2 border-gray-300 p-4 bg-white">
                        <p className="text-sm font-bold text-black">{ph.phase || `Phase ${i + 1}`}</p>
                        <dl className="mt-3 space-y-2 text-xs text-gray-700">
                          <div>
                            <dt className="font-semibold text-gray-900">Benefits</dt>
                            <dd className="whitespace-pre-wrap mt-0.5">{ph.benefits}</dd>
                          </div>
                          <div>
                            <dt className="font-semibold text-gray-900">Challenges</dt>
                            <dd className="whitespace-pre-wrap mt-0.5">{ph.challenges}</dd>
                          </div>
                          <div>
                            <dt className="font-semibold text-gray-900">Risks</dt>
                            <dd className="whitespace-pre-wrap mt-0.5">{ph.risks}</dd>
                          </div>
                          <div>
                            <dt className="font-semibold text-gray-900">Budget considerations</dt>
                            <dd className="whitespace-pre-wrap mt-0.5">{ph.budgetConsiderations}</dd>
                          </div>
                        </dl>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
