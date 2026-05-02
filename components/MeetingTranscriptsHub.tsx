'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import ChatInterface from '@/components/ChatInterface';

interface DriveFileRow {
  fileId: string;
  name?: string;
  title?: string;
  mimeType?: string;
}

function isSelectableTranscript(f: DriveFileRow) {
  const name = (f.title || f.name || '').trim();
  const lower = name.toLowerCase();
  if (lower.startsWith('meeting note summary')) return false;
  const m = (f.mimeType || '').toLowerCase();
  if (lower.endsWith('.doc') || lower.endsWith('.docx')) return true;
  if (m.includes('wordprocessingml') || m.includes('msword')) return true;
  return false;
}

/**
 * Meeting transcripts in the isolated Drive folder: upload, list, multi-select,
 * vectorize into PINECONE_SECTION_NAMESPACE, chat (section RAG only), generate structured .docx summaries.
 */
export default function MeetingTranscriptsHub() {
  const [files, setFiles] = useState<DriveFileRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [vectorizing, setVectorizing] = useState<'all' | 'one' | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [sectionFolderMissing, setSectionFolderMissing] = useState(false);
  const [lastResults, setLastResults] = useState<
    Array<{
      fileId: string;
      fileName?: string;
      success: boolean;
      skipped?: boolean;
      summaryFileName?: string;
      error?: string;
    }>
  | null>(null);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/google-drive/list?scope=section');
      const data = await res.json();
      if (res.ok && data.sectionConfigured === false) {
        setSectionFolderMissing(true);
        setFiles([]);
        return;
      }
      setSectionFolderMissing(false);
      if (res.ok && data.files) {
        setFiles(data.files);
      } else {
        setFiles([]);
        alert(data.error || data.details || 'Could not list Drive files.');
      }
    } catch {
      setFiles([]);
      alert('Failed to load Google Drive file list.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const selectable = useMemo(() => files.filter(isSelectableTranscript), [files]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllSelectable = () => {
    setSelected(new Set(selectable.map((f) => f.fileId)));
  };

  const clearSelection = () => setSelected(new Set());

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(list)) {
        const form = new FormData();
        form.append('file', file);
        form.append('scope', 'section');
        const res = await fetch('/api/google-drive/upload', { method: 'POST', body: form });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.details || data.error || `Upload failed: ${file.name}`);
        }
      }
      await loadFiles();
      alert(`Uploaded ${list.length} file(s) to your section Drive folder.`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const runVectorize = async (fileId?: string) => {
    const mode = fileId ? 'one' : 'all';
    setVectorizing(mode);
    try {
      const res = await fetch('/api/google-drive/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(fileId ? { fileId } : {}),
          scope: 'section',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Vectorize failed');
      }
      const okCount = (data.results || []).filter((r: { ok?: boolean }) => r.ok).length;
      const fail = (data.results || []).filter((r: { ok?: boolean }) => !r.ok);
      alert(
        `Vectorize finished.\n${okCount} file(s) succeeded, ${data.totalChunks ?? 0} chunks in section namespace.` +
          (fail.length
            ? `\n\nFailed:\n${fail.map((f: { name?: string; error?: string }) => `${f.name}: ${f.error}`).join('\n')}`
            : '')
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Vectorize failed');
    } finally {
      setVectorizing(null);
    }
  };

  const runGenerate = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) {
      alert('Select at least one Word transcript.');
      return;
    }
    if (ids.length > 25) {
      alert('Select at most 25 files per run.');
      return;
    }
    if (
      !confirm(
        `Generate ${ids.length} meeting note .docx file(s) and save them to your section folder (same Drive folder as transcripts unless MEETING_NOTES_SECTION_OUTPUT_FOLDER_ID is set)?`
      )
    ) {
      return;
    }

    setGenerating(true);
    setProgress(`Analyzing ${ids.length} transcript(s)…`);
    setLastResults(null);
    try {
      const res = await fetch('/api/meeting-notes/generate-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileIds: ids, outputScope: 'section' }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Generation failed');
      }
      setLastResults(data.results || []);
      setProgress(null);
      await loadFiles();
      const ok = (data.results || []).filter((r: { success: boolean }) => r.success).length;
      alert(`Done. ${ok} summary document(s) written to Drive.`);
    } catch (err) {
      setProgress(null);
      alert(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border-2 border-black bg-gray-50 p-4 md:p-5">
        <h2 className="text-lg font-bold text-gray-900">Meeting transcripts (isolated workspace)</h2>
        <p className="text-sm text-gray-700 mt-2 leading-relaxed">
          Upload <strong>.doc</strong> or <strong>.docx</strong> transcripts to{' '}
          <code className="bg-white px-1 rounded text-xs">GOOGLE_DRIVE_SECTION_FOLDER_ID</code>, select files below,{' '}
          <strong>vectorize</strong> so chat can retrieve them (Pinecone namespace{' '}
          <code className="bg-white px-1 rounded text-xs">PINECONE_SECTION_NAMESPACE</code> only — not the main
          knowledge base). Then generate structured <strong>Word summaries</strong> per selected transcript: title,
          date, byline, <strong>Action items</strong>, <strong>Decisions</strong>, <strong>Risks</strong>,{' '}
          <strong>Assumptions</strong>, and an <strong>outline</strong> with summarized transcript detail. Author line
          uses <code className="bg-white px-1 rounded text-xs">MEETING_NOTES_AUTHOR</code> (default Joseph Hendrickson).
        </p>
      </div>

      {sectionFolderMissing && (
        <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-semibold">Configure the section Drive folder</p>
          <p className="mt-1">
            Set <code className="rounded bg-white/80 px-1">GOOGLE_DRIVE_SECTION_FOLDER_ID</code> and{' '}
            <code className="rounded bg-white/80 px-1">PINECONE_SECTION_NAMESPACE</code> in{' '}
            <code className="rounded bg-white/80 px-1">.env.local</code>, then refresh.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        <div className="flex flex-col gap-4 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex">
              <input
                type="file"
                accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                multiple
                className="hidden"
                disabled={uploading || sectionFolderMissing}
                onChange={handleUpload}
                id="mt-hub-upload"
              />
              <span
                role="button"
                tabIndex={0}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter' || ev.key === ' ') document.getElementById('mt-hub-upload')?.click();
                }}
                onClick={() => document.getElementById('mt-hub-upload')?.click()}
                className={`px-4 py-2 rounded-lg text-sm font-semibold border-2 border-black bg-black text-white cursor-pointer ${
                  uploading || sectionFolderMissing ? 'opacity-50 pointer-events-none' : ''
                }`}
              >
                {uploading ? 'Uploading…' : 'Upload transcripts'}
              </span>
            </label>
            <button
              type="button"
              onClick={loadFiles}
              disabled={loading || sectionFolderMissing}
              className="px-4 py-2 rounded-lg text-sm font-semibold border border-gray-400 hover:bg-gray-100 disabled:opacity-50"
            >
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
            <button
              type="button"
              onClick={selectAllSelectable}
              disabled={sectionFolderMissing}
              className="px-4 py-2 rounded-lg text-sm font-semibold border border-gray-400 hover:bg-gray-100 disabled:opacity-50"
            >
              Select all transcripts
            </button>
            <button
              type="button"
              onClick={clearSelection}
              className="px-4 py-2 rounded-lg text-sm font-semibold border border-gray-400 hover:bg-gray-100"
            >
              Clear selection
            </button>
            <button
              type="button"
              onClick={() => runVectorize()}
              disabled={vectorizing !== null || sectionFolderMissing}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {vectorizing === 'all' ? 'Vectorizing…' : 'Vectorize folder'}
            </button>
            <button
              type="button"
              onClick={runGenerate}
              disabled={generating || selected.size === 0 || sectionFolderMissing}
              className="px-4 py-2 rounded-lg text-sm font-semibold border-2 border-black bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              {generating ? 'Generating…' : `Generate .docx (${selected.size})`}
            </button>
          </div>

          {progress && <p className="text-sm text-gray-700">{progress}</p>}

          <div className="border-2 border-gray-200 rounded-xl overflow-hidden flex flex-col max-h-[520px]">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-3 py-2 text-xs font-semibold text-gray-600">
              Section folder — select transcripts ({selectable.length} eligible)
            </div>
            <div className="overflow-y-auto flex-1">
              {loading ? (
                <p className="p-4 text-sm text-gray-500">Loading…</p>
              ) : files.length === 0 ? (
                <p className="p-4 text-sm text-gray-500">
                  {sectionFolderMissing
                    ? 'Configure the section folder to see files.'
                    : 'No files in this folder yet. Upload transcripts above.'}
                </p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {files.map((f) => {
                    const ok = isSelectableTranscript(f);
                    const name = f.title || f.name || f.fileId;
                    const checked = selected.has(f.fileId);
                    return (
                      <li key={f.fileId} className="flex items-stretch gap-0">
                        <label
                          className={`flex flex-1 items-start gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50 ${
                            !ok ? 'opacity-50 cursor-not-allowed' : ''
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="mt-1"
                            disabled={!ok}
                            checked={checked}
                            onChange={() => ok && toggle(f.fileId)}
                          />
                          <span className="text-sm text-gray-800 break-words flex-1">
                            {name}
                            {!ok && (
                              <span className="block text-xs text-gray-500 mt-0.5">
                                Not a selectable transcript (.doc/.docx; summaries excluded).
                              </span>
                            )}
                          </span>
                        </label>
                        {ok && (
                          <button
                            type="button"
                            title="Re-vectorize this file only"
                            disabled={vectorizing !== null}
                            onClick={() => runVectorize(f.fileId)}
                            className="shrink-0 px-2 py-2 text-xs font-medium text-gray-700 border-l border-gray-200 hover:bg-gray-100 disabled:opacity-50"
                          >
                            {vectorizing === 'one' ? '…' : 'Index'}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          <div className="border border-gray-200 rounded-xl p-4 bg-white">
            <h3 className="text-sm font-bold text-gray-900 mb-2">Last generation run</h3>
            {!lastResults?.length ? (
              <p className="text-sm text-gray-500">Generate summaries to see results here.</p>
            ) : (
              <ul className="space-y-2 text-sm max-h-48 overflow-y-auto">
                {lastResults.map((r) => (
                  <li
                    key={r.fileId}
                    className={`rounded-lg border p-2 ${
                      r.success
                        ? 'border-green-200 bg-green-50'
                        : r.skipped
                          ? 'border-amber-200 bg-amber-50'
                          : 'border-red-200 bg-red-50'
                    }`}
                  >
                    <p className="font-medium text-gray-900">{r.fileName || r.fileId}</p>
                    {r.success && <p className="text-xs text-green-800 mt-1">Created: {r.summaryFileName}</p>}
                    {r.skipped && <p className="text-xs text-amber-900 mt-1">Skipped</p>}
                    {!r.success && r.error && <p className="text-xs text-red-800 mt-1">{r.error}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="min-h-[560px] flex flex-col border-2 border-gray-200 rounded-xl overflow-hidden bg-white">
          <div className="px-3 py-2 border-b border-gray-100 text-xs font-semibold text-gray-600 bg-gray-50">
            Chat (section transcripts only — vectorize first)
          </div>
          <div className="flex-1 min-h-0 p-2">
            <ChatInterface knowledgeScope="section" />
          </div>
        </div>
      </div>
    </div>
  );
}
