'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import MeetingNotesChat from '@/components/MeetingNotesChat';
import {
  isMeetingTranscriptDriveFile,
  MEETING_TRANSCRIPT_CHAT_MAX_FILES,
} from '@/lib/meeting-transcript-files';

interface DriveFileRow {
  fileId: string;
  name?: string;
  title?: string;
  mimeType?: string;
}

function isSelectableTranscript(f: DriveFileRow) {
  return isMeetingTranscriptDriveFile((f.title || f.name || '').trim(), f.mimeType);
}

export default function MeetingNotesWorkspace() {
  const [files, setFiles] = useState<DriveFileRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
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
      const res = await fetch('/api/google-drive/list');
      const data = await res.json();
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
        const res = await fetch('/api/google-drive/upload', { method: 'POST', body: form });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.details || data.error || `Upload failed: ${file.name}`);
        }
      }
      await loadFiles();
      alert(`Uploaded ${list.length} file(s) to your configured Drive folder.`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
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
    if (!confirm(`Generate ${ids.length} meeting note summary file(s) in Google Drive?`)) return;

    setGenerating(true);
    setProgress(`Analyzing ${ids.length} transcript(s)…`);
    setLastResults(null);
    try {
      const res = await fetch('/api/meeting-notes/generate-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileIds: ids }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Generation failed');
      }
      setLastResults(data.results || []);
      setProgress(null);
      await loadFiles();
      const ok = (data.results || []).filter((r: { success: boolean }) => r.success).length;
      alert(`Done. ${ok} summary document(s) uploaded to Drive.`);
    } catch (err) {
      setProgress(null);
      alert(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 min-h-[560px]">
      <div className="rounded-xl border-2 border-black bg-gray-50 p-4 md:p-5">
        <h2 className="text-lg font-bold text-gray-900">Transcript → meeting note summaries</h2>
        <p className="text-sm text-gray-700 mt-2 leading-relaxed">
          Upload <strong>.doc</strong> or <strong>.docx</strong> meeting transcripts to your linked Google Drive folder,
          select them below, then generate one Word summary per transcript—or use the <strong>transcript-only chat</strong>{' '}
          on the right to ask questions grounded only in your current selection. Each summary includes the meeting title,
          date, <strong>Meeting notes by</strong> your configured author (
          <code className="bg-white px-1">MEETING_NOTES_AUTHOR</code>, default Joseph Hendrickson), then{' '}
          <strong>Action items</strong>, <strong>Decisions</strong>, <strong>Risks</strong>, <strong>Assumptions</strong>,
          and an <strong>Outline of the meeting</strong> with summarized transcript detail per subsection.
        </p>
        <p className="text-xs text-gray-600 mt-2">
          Output files are named <code className="bg-white px-1 rounded">Meeting note summary – … .docx</code> and are
          written to the same folder as <code className="bg-white px-1">GOOGLE_DRIVE_FOLDER_ID</code>, unless you set{' '}
          <code className="bg-white px-1">MEETING_NOTES_OUTPUT_FOLDER_ID</code>.
        </p>
        <p className="text-xs text-gray-600 mt-1">
          Google Cloud setup: see <code className="bg-white px-1">MEETING_NOTES_GOOGLE_SETUP.md</code> in the project
          root.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex">
          <input
            type="file"
            accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            multiple
            className="hidden"
            disabled={uploading}
            onChange={handleUpload}
            id="mn-upload"
          />
          <span
            role="button"
            tabIndex={0}
            onKeyDown={(ev) => {
              if (ev.key === 'Enter' || ev.key === ' ') document.getElementById('mn-upload')?.click();
            }}
            onClick={() => document.getElementById('mn-upload')?.click()}
            className={`px-4 py-2 rounded-lg text-sm font-semibold border-2 border-black bg-black text-white cursor-pointer ${
              uploading ? 'opacity-50 pointer-events-none' : ''
            }`}
          >
            {uploading ? 'Uploading…' : 'Upload transcripts to Drive'}
          </span>
        </label>
        <button
          type="button"
          onClick={loadFiles}
          disabled={loading}
          className="px-4 py-2 rounded-lg text-sm font-semibold border border-gray-400 hover:bg-gray-100 disabled:opacity-50"
        >
          {loading ? 'Refreshing…' : 'Refresh list'}
        </button>
        <button
          type="button"
          onClick={selectAllSelectable}
          className="px-4 py-2 rounded-lg text-sm font-semibold border border-gray-400 hover:bg-gray-100"
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
          onClick={runGenerate}
          disabled={generating || selected.size === 0}
          className="px-4 py-2 rounded-lg text-sm font-semibold border-2 border-black bg-white text-black hover:bg-gray-100 disabled:opacity-50"
        >
          {generating ? 'Working…' : `Generate summaries (${selected.size})`}
        </button>
      </div>

      {progress && <p className="text-sm text-gray-700">{progress}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch min-h-[480px]">
        <div className="flex flex-col gap-4 min-w-0 min-h-0">
          <div className="flex-1 min-h-0 border-2 border-gray-200 rounded-xl overflow-hidden flex flex-col max-h-[380px]">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-3 py-2 text-xs font-semibold text-gray-600 z-10 leading-snug">
              Drive files — select Word transcripts ({selectable.length} eligible in folder; transcript chat uses up to{' '}
              {MEETING_TRANSCRIPT_CHAT_MAX_FILES} per message — generate summaries still allows up to 25)
            </div>
            <div className="overflow-y-auto flex-1">
              {loading ? (
                <p className="p-4 text-sm text-gray-500">Loading…</p>
              ) : files.length === 0 ? (
                <p className="p-4 text-sm text-gray-500">
                  No files found. Set GOOGLE_DRIVE_FOLDER_ID and authorize Drive.
                </p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {files.map((f) => {
                    const ok = isSelectableTranscript(f);
                    const name = f.title || f.name || f.fileId;
                    const checked = selected.has(f.fileId);
                    return (
                      <li key={f.fileId}>
                        <label
                          className={`flex items-start gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50 ${
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
                          <span className="text-sm text-gray-800 break-words">
                            {name}
                            {!ok && (
                              <span className="block text-xs text-gray-500 mt-0.5">
                                Not selectable (use .doc/.docx transcripts; summary outputs are excluded).
                              </span>
                            )}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          <div className="border border-gray-200 rounded-xl p-4 bg-white max-h-56 overflow-y-auto shrink-0">
            <h3 className="text-sm font-bold text-gray-900 mb-2">Last run</h3>
            {!lastResults?.length ? (
              <p className="text-sm text-gray-500">Generate summaries to see per-file results here.</p>
            ) : (
              <ul className="space-y-2 text-sm">
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

        <div className="min-h-[480px] lg:min-h-[560px]">
          <MeetingNotesChat selectedFileIds={Array.from(selected)} files={files} />
        </div>
      </div>
    </div>
  );
}
