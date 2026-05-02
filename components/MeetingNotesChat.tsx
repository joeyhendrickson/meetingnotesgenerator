'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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

interface Message {
  role: 'user' | 'assistant';
  content: string;
  confidenceScore?: number;
}

interface MeetingNotesChatProps {
  selectedFileIds: string[];
  files: DriveFileRow[];
}

export default function MeetingNotesChat({ selectedFileIds, files }: MeetingNotesChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const prevSelectionKey = useRef<string | null>(null);

  const selectionKey = useMemo(
    () => [...selectedFileIds].sort().join('|'),
    [selectedFileIds]
  );

  const fileIdsForChat = useMemo(
    () => selectedFileIds.slice(0, MEETING_TRANSCRIPT_CHAT_MAX_FILES),
    [selectedFileIds]
  );
  const chatTruncated = selectedFileIds.length > MEETING_TRANSCRIPT_CHAT_MAX_FILES;

  const contextLabels = useMemo(() => {
    return fileIdsForChat.map((id) => {
      const f = files.find((row) => row.fileId === id);
      if (!f || !isMeetingTranscriptDriveFile(f.title || f.name || '', f.mimeType)) return null;
      return f.title || f.name || id;
    }).filter((label): label is string => label != null);
  }, [fileIdsForChat, files]);

  useEffect(() => {
    if (prevSelectionKey.current !== null && prevSelectionKey.current !== selectionKey) {
      setMessages([]);
    }
    prevSelectionKey.current = selectionKey;
  }, [selectionKey]);

  /** Scroll only the chat transcript pane—never the main window (avoids jump when selecting Drive files). */
  useEffect(() => {
    if (messages.length === 0 && !loading) return;
    const el = messagesScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading || selectedFileIds.length === 0) return;

    const userMsg: Message = { role: 'user', content: input.trim() };
    setMessages((m) => [...m, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat/meeting-transcripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg.content,
          history: messages,
          fileIds: fileIdsForChat,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Request failed');
      }
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          content: data.response || '',
          confidenceScore: typeof data.confidenceScore === 'number' ? data.confidenceScore : undefined,
        },
      ]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          content: `Error: ${err instanceof Error ? err.message : 'Something went wrong.'}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const disabled = selectedFileIds.length === 0;

  return (
    <div className="flex flex-col h-full min-h-[400px] border-2 border-black rounded-xl overflow-hidden bg-white">
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <h3 className="text-sm font-bold text-gray-900">Chat about selected transcripts</h3>
        <p className="text-xs text-gray-600 mt-1 leading-relaxed">
          Answers use <strong>only</strong> the Word transcripts you checked in the list on the left—not the main app
          chat or Pinecone knowledge base. Select one or more files, then ask questions about those meetings.
        </p>
        {disabled ? (
          <p className="text-xs font-medium text-amber-800 mt-2">Select at least one transcript to enable chat.</p>
        ) : (
          <>
            {chatTruncated && (
              <p className="text-xs font-medium text-amber-800 mt-2">
                Transcript chat is limited to {MEETING_TRANSCRIPT_CHAT_MAX_FILES} files per message. Using the first{' '}
                {MEETING_TRANSCRIPT_CHAT_MAX_FILES} of {selectedFileIds.length} selected (same order as in the list on
                the left).
              </p>
            )}
            <p className="text-xs text-gray-700 mt-2">
              <span className="font-semibold">In context for chat:</span>{' '}
              {contextLabels.join('; ') || `${fileIdsForChat.length} file(s)`}
            </p>
          </>
        )}
      </div>

      <div
        ref={messagesScrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-3 bg-gradient-to-b from-gray-50 to-white min-h-0"
      >
        {messages.length === 0 && !disabled && (
          <p className="text-sm text-gray-500 text-center py-8">
            Ask about action items, decisions, who said what, or themes across the selected transcript(s).
          </p>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[92%] rounded-xl px-4 py-2 text-sm whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-black text-white rounded-tr-sm'
                  : 'bg-white text-gray-900 border-2 border-gray-300 rounded-tl-sm'
              }`}
            >
              {msg.content}
              {msg.role === 'assistant' && msg.confidenceScore != null && (
                <p className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-200">
                  Confidence: {(msg.confidenceScore * 100).toFixed(0)}% (based on how much transcript text is in
                  context)
                </p>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-xl px-4 py-3 bg-white border border-gray-200 text-sm text-gray-500">
              Thinking…
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="p-3 border-t border-gray-200 flex gap-2 bg-white">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            disabled ? 'Select transcripts on the left…' : 'Ask about the selected meeting(s)…'
          }
          disabled={loading || disabled}
          className="flex-1 px-4 py-3 border-2 border-gray-400 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black disabled:bg-gray-100"
        />
        <button
          type="submit"
          disabled={loading || disabled || !input.trim()}
          className="px-5 py-3 bg-black text-white text-sm font-semibold rounded-lg disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
