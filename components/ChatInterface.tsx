'use client';

import { useState, useRef, useEffect } from 'react';

export interface AdvisorProjectFile {
  fileName: string;
  text: string;
}

interface ChatInterfaceProps {
  advisorProject?: AdvisorProjectFile | null;
  onAdvisorProjectChange?: (project: AdvisorProjectFile | null) => void;
  /** When set to video-scripting, opens the template workflow tuned for narration / scene work. */
  workflowVariant?: 'default' | 'video-scripting';
}

interface Source {
  title: string;
  fileId: string;
  text: string;
  score: number;
  chunkIndex: number;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  contextUsed?: boolean;
  sources?: Source[];
  confidenceScore?: number;
  timestamp?: string;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

export default function ChatInterface({
  advisorProject = null,
  onAdvisorProjectChange,
  workflowVariant = 'default',
}: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [playingMessageIndex, setPlayingMessageIndex] = useState<number | null>(null);
  const [showProjectPanel, setShowProjectPanel] = useState(false);
  const [projectUploading, setProjectUploading] = useState(false);
  const [projectUploadError, setProjectUploadError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speechSynthesisRef = useRef<SpeechSynthesisUtterance | null>(null);
  const projectFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (workflowVariant === 'video-scripting' && !advisorProject) {
      setShowProjectPanel(true);
      setProjectUploadError(null);
    }
  }, [workflowVariant, advisorProject]);

  // Load conversations from localStorage on mount
  useEffect(() => {
    loadConversationsFromHistory();
  }, []);

  const saveConversationToHistory = (conversationMessages: Message[]) => {
    if (conversationMessages.length === 0) return;

    const conversationsKey = 'ultra_conversations';
    const existingConversations: Conversation[] = JSON.parse(
      localStorage.getItem(conversationsKey) || '[]'
    );

    const firstUserMessage = conversationMessages.find(m => m.role === 'user');
    const title = firstUserMessage?.content.substring(0, 50) || 'New Conversation';
    const now = new Date().toISOString();

    let conversation: Conversation;
    if (selectedConversation) {
      // Update existing conversation
      conversation = {
        id: selectedConversation,
        title,
        messages: conversationMessages,
        createdAt: existingConversations.find(c => c.id === selectedConversation)?.createdAt || now,
        updatedAt: now,
      };
      const index = existingConversations.findIndex(c => c.id === selectedConversation);
      existingConversations[index] = conversation;
    } else {
      // Create new conversation
      conversation = {
        id: Date.now().toString(),
        title,
        messages: conversationMessages,
        createdAt: now,
        updatedAt: now,
      };
      existingConversations.unshift(conversation);
    }

    // Keep only last 50 conversations
    const recentConversations = existingConversations.slice(0, 50);
    localStorage.setItem(conversationsKey, JSON.stringify(recentConversations));
    setConversations(recentConversations);
  };

  const loadConversationsFromHistory = () => {
    const conversationsKey = 'ultra_conversations';
    const stored = localStorage.getItem(conversationsKey);
    if (stored) {
      const parsed: Conversation[] = JSON.parse(stored);
      setConversations(parsed);
    }
  };

  const loadConversation = (conversationId: string) => {
    const conversation = conversations.find(c => c.id === conversationId);
    if (conversation) {
      setMessages(conversation.messages);
      setSelectedConversation(conversationId);
      setShowHistory(false);
    }
  };

  const startNewConversation = () => {
    setMessages([]);
    setSelectedConversation(null);
    setShowHistory(false);
  };

  const handleAdvisorProjectFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !onAdvisorProjectChange) return;

    setProjectUploadError(null);
    setProjectUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/advisor-project/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Upload failed');
      }
      onAdvisorProjectChange({
        fileName: data.fileName || file.name,
        text: data.text || '',
      });
      setShowProjectPanel(false);
    } catch (err) {
      setProjectUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setProjectUploading(false);
    }
  };

  const deleteConversation = (conversationId: string) => {
    const updated = conversations.filter(c => c.id !== conversationId);
    localStorage.setItem('ultra_conversations', JSON.stringify(updated));
    setConversations(updated);
    if (selectedConversation === conversationId) {
      startNewConversation();
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('Form submitted, input:', input);
    if (!input.trim() || isLoading) {
      console.log('Form submission blocked - empty input or loading');
      return;
    }

    const userMessage: Message = {
      role: 'user',
      content: input,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: input,
          history: messages,
          ...(advisorProject
            ? {
                projectContext: advisorProject.text,
                projectFileName: advisorProject.fileName,
              }
            : {}),
        }),
      });

      const data = await response.json();

      if (response.ok) {
        const assistantMessage: Message = {
          role: 'assistant',
          content: data.response,
          contextUsed: data.contextUsed,
          sources: data.sources || [],
          confidenceScore: data.confidenceScore || 0,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
        
        // Save to history
        saveConversationToHistory([...messages, userMessage, assistantMessage]);
      } else {
        throw new Error(data.error || 'Failed to get response');
      }
    } catch (error) {
      const errorMessage: Message = {
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Failed to get response'}`,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const speakMessage = async (messageIndex: number, text: string) => {
    // Stop any currently playing audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (speechSynthesisRef.current) {
      window.speechSynthesis.cancel();
      speechSynthesisRef.current = null;
    }

    // If clicking the same message that's playing, stop it
    if (playingMessageIndex === messageIndex) {
      setPlayingMessageIndex(null);
      return;
    }

    setPlayingMessageIndex(messageIndex);

    try {
      // Try OpenAI TTS first
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
      });

      if (response.ok) {
        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        audioRef.current = audio;

        audio.onended = () => {
          setPlayingMessageIndex(null);
          URL.revokeObjectURL(audioUrl);
        };

        audio.onerror = () => {
          console.error('Audio playback error, falling back to browser TTS');
          setPlayingMessageIndex(null);
          URL.revokeObjectURL(audioUrl);
          // Fall back to browser TTS
          fallbackToBrowserTTS(text, messageIndex);
        };

        await audio.play();
      } else {
        // If OpenAI TTS fails, fall back to browser TTS
        throw new Error('OpenAI TTS failed');
      }
    } catch (error) {
      console.warn('OpenAI TTS failed, using browser TTS:', error);
      fallbackToBrowserTTS(text, messageIndex);
    }
  };

  const fallbackToBrowserTTS = (text: string, messageIndex: number) => {
    // Stop any current speech
    window.speechSynthesis.cancel();

    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      utterance.onend = () => {
        setPlayingMessageIndex(null);
        speechSynthesisRef.current = null;
      };

      utterance.onerror = (event) => {
        console.error('Browser TTS error:', event);
        setPlayingMessageIndex(null);
        speechSynthesisRef.current = null;
      };

      speechSynthesisRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    } else {
      console.error('Browser TTS not supported');
      setPlayingMessageIndex(null);
    }
  };

  const stopSpeaking = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (speechSynthesisRef.current) {
      window.speechSynthesis.cancel();
      speechSynthesisRef.current = null;
    }
    setPlayingMessageIndex(null);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopSpeaking();
    };
  }, []);

  const exportConversation = () => {
    if (messages.length === 0) return;
    
    const firstUserMessage = messages.find(m => m.role === 'user');
    const title = firstUserMessage?.content.substring(0, 50) || 'Conversation';
    const date = new Date().toLocaleString();
    
    let content = `Ultra Advisor - Conversation Export\n`;
    content += `Generated: ${date}\n`;
    content += `Title: ${title}\n\n`;
    content += `${'='.repeat(60)}\n\n`;
    
    messages.forEach((msg) => {
      content += `${msg.role === 'user' ? 'You' : 'AI Advisor'}: ${msg.content}\n\n`;
      
      if (msg.role === 'assistant' && msg.sources && msg.sources.length > 0) {
        content += `Sources:\n`;
        msg.sources.forEach((source, idx) => {
          content += `  ${idx + 1}. ${source.title} (${(source.score * 100).toFixed(0)}%)\n`;
        });
        content += `\n`;
      }
      
      if (msg.role === 'assistant' && msg.confidenceScore !== undefined) {
        content += `Confidence: ${(msg.confidenceScore * 100).toFixed(0)}%\n\n`;
      }
      
      content += `${'-'.repeat(60)}\n\n`;
    });
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ultra-chat-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const projectControlsEnabled = Boolean(onAdvisorProjectChange);

  return (
    <div className="flex flex-col h-[650px] lg:h-[700px]">
      {projectControlsEnabled && (showProjectPanel || advisorProject) && (
        <div className="mb-4 p-4 rounded-xl border-2 border-dashed border-gray-400 bg-gray-50 space-y-3">
          {showProjectPanel && (
            <div>
              <p className="text-sm font-semibold text-gray-900">
                {workflowVariant === 'video-scripting' ? 'Upload video script or storyboard' : 'Upload project template'}
              </p>
              <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                {workflowVariant === 'video-scripting' ? (
                  <>
                    Use a Word document (.doc or .docx) with scene or slide descriptions and visual notes. The advisor
                    uses it for narration and structure, and still searches your vector knowledge base for Blackboard
                    Ultra grounding when relevant.
                  </>
                ) : (
                  <>
                    Use a Word document (.doc or .docx)—for example a video script or slide outline with visual notes.
                    The advisor uses your file for structure and scene-by-scene context, and still queries the vector
                    knowledge base so answers stay grounded in your Ultra materials when relevant.
                  </>
                )}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={projectUploading}
                  onClick={() => projectFileInputRef.current?.click()}
                  className="px-4 py-2 text-sm font-semibold text-white bg-black rounded-lg hover:opacity-90 disabled:opacity-50 border border-black"
                >
                  {projectUploading ? 'Reading document…' : 'Choose .doc / .docx'}
                </button>
                <button
                  type="button"
                  disabled={projectUploading}
                  onClick={() => {
                    setShowProjectPanel(false);
                    setProjectUploadError(null);
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-white"
                >
                  Close
                </button>
              </div>
            </div>
          )}
          {advisorProject && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-2 border-t border-gray-200">
              <p className="text-sm text-gray-800">
                <span className="font-semibold">Active project:</span>{' '}
                {advisorProject.fileName}{' '}
                <span className="text-gray-500">
                  ({advisorProject.text.length.toLocaleString()} characters)
                </span>
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => projectFileInputRef.current?.click()}
                  className="px-3 py-1.5 text-xs font-semibold border border-black rounded-lg hover:bg-gray-100"
                >
                  Replace file
                </button>
                <button
                  type="button"
                  onClick={() => onAdvisorProjectChange?.(null)}
                  className="px-3 py-1.5 text-xs font-semibold text-red-700 border border-red-200 rounded-lg hover:bg-red-50"
                >
                  Remove project
                </button>
              </div>
            </div>
          )}
          <input
            ref={projectFileInputRef}
            type="file"
            accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            aria-hidden
            onChange={handleAdvisorProjectFile}
          />
          {projectUploadError && <p className="text-sm text-red-600">{projectUploadError}</p>}
        </div>
      )}
      {/* Header with Actions */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              console.log('New chat clicked');
              startNewConversation();
            }}
            className="px-4 py-2 text-sm font-medium text-black hover:bg-gray-100 rounded-lg transition-colors border border-gray-300"
          >
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Chat
            </span>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              console.log('History button clicked');
              setShowHistory(!showHistory);
            }}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              History
            </span>
          </button>
        </div>
        {messages.length > 0 && (
          <button
            onClick={exportConversation}
            className="px-4 py-2 text-sm font-medium text-black hover:bg-gray-100 rounded-lg transition-colors border border-gray-300"
          >
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export
            </span>
          </button>
        )}
      </div>

      <div className="flex-1 flex gap-4 min-h-0">
        {/* History Sidebar */}
        {showHistory && (
          <div className="w-64 flex-shrink-0 bg-white border border-gray-200 rounded-xl p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-800">Conversation History</h3>
              <button
                onClick={() => setShowHistory(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {conversations.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">No conversation history</p>
            ) : (
              <div className="space-y-2">
                {conversations.map((conv) => (
                  <div
                    key={conv.id}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedConversation === conv.id
                          ? 'bg-gray-200 border-black'
                          : 'bg-white border-gray-400 hover:bg-gray-100'
                    }`}
                    onClick={() => loadConversation(conv.id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate" title={conv.title}>
                          {conv.title}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {new Date(conv.updatedAt).toLocaleDateString()}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          {conv.messages.length} messages
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteConversation(conv.id);
                        }}
                        className="text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto mb-6 space-y-4 p-4 lg:p-6 bg-gradient-to-b from-gray-50 to-white rounded-xl border border-gray-100 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
        {messages.length === 0 && (
          <div className="text-center text-gray-600 mt-12">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-200 rounded-full mb-4 border-2 border-black">
              <svg className="w-8 h-8 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <p className="text-xl font-semibold mb-2 text-gray-800">
              {workflowVariant === 'video-scripting' ? 'Video scripting' : 'Welcome to ULTRA Advisor'}
            </p>
            {advisorProject ? (
              <>
                <p className="text-gray-600 mb-1">
                  You have an active script or template. Ask for narration, scene-by-scene copy, or clarifications that
                  follow your document&apos;s visuals and order. I will use your upload together with the vector
                  knowledge base when answering.
                </p>
                <p className="text-sm text-gray-500 mt-2">
                  Tip: reference scene or slide labels from your file so answers line up with your template.
                </p>
              </>
            ) : workflowVariant === 'video-scripting' ? (
              <>
                <p className="text-gray-600 mb-1">
                  Upload a script or slide-backed outline, then ask for narration aligned to each visual beat. The
                  vector knowledge base still applies for Ultra-specific facts.
                </p>
                <p className="text-sm text-gray-500 mt-2">Use the panel above to attach your .doc or .docx.</p>
              </>
            ) : (
              <>
                <p className="text-gray-600 mb-1">
                  Ask me anything about Blackboard Ultra, course setup, management, strategic use of Ultra, or content
                  questions.
                </p>
                <p className="text-sm text-gray-500 mt-2">
                  I&apos;ll reference a vast knowledge base about Ultra to provide my responses.
                </p>
              </>
            )}
          </div>
        )}
        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex items-start gap-3 ${
              message.role === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            {message.role === 'assistant' && (
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-black flex items-center justify-center text-white text-sm font-semibold shadow-md border border-gray-300">
                AI
              </div>
            )}
            <div
              className={`max-w-[80%] lg:max-w-[75%] rounded-2xl p-4 shadow-md ${
                message.role === 'user'
                  ? 'bg-black text-white rounded-tr-sm'
                  : 'bg-white text-black border-2 border-black rounded-tl-sm'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="whitespace-pre-wrap leading-relaxed flex-1">{message.content}</p>
                {message.role === 'assistant' && (
                  <button
                    onClick={() => speakMessage(index, message.content)}
                    className={`flex-shrink-0 p-2 rounded-lg transition-colors ${
                      playingMessageIndex === index
                        ? 'bg-blue-100 text-blue-600'
                        : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                    }`}
                    title={playingMessageIndex === index ? 'Stop speaking' : 'Speak message'}
                  >
                    {playingMessageIndex === index ? (
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                      </svg>
                    )}
                  </button>
                )}
              </div>
              
              {message.role === 'assistant' && (
                <>
                  {/* Confidence Indicator */}
                  {message.confidenceScore !== undefined && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="flex items-center gap-1">
                          <div className={`w-3 h-3 rounded-full ${
                            message.confidenceScore >= 0.8 ? 'bg-black' :
                            message.confidenceScore >= 0.6 ? 'bg-gray-600' :
                            'bg-gray-400'
                          }`}></div>
                          <span className="text-xs font-semibold text-gray-600">
                            {message.confidenceScore >= 0.8 ? 'High' :
                             message.confidenceScore >= 0.6 ? 'Medium' :
                             'Low'} Confidence
                          </span>
                          <span className="text-xs text-gray-500">
                            ({(message.confidenceScore * 100).toFixed(0)}%)
                          </span>
                        </div>
                      </div>
                      {message.confidenceScore < 0.6 && (
                        <p className="text-xs text-yellow-600 italic mb-2">
                          ⚠️ Answer may be less reliable. Consider verifying information.
                        </p>
                      )}
                    </div>
                  )}
                  
                  {/* Sources & Citations */}
                  {message.sources && message.sources.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <div className="flex items-center gap-1 mb-2">
                        <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        <p className="text-xs font-semibold text-gray-600">Sources ({message.sources.length})</p>
                      </div>
                      <div className="space-y-2">
                        {message.sources.map((source, idx) => (
                          <div key={idx} className="bg-gray-50 rounded-lg p-2 border border-gray-200">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-gray-800 truncate" title={source.title}>
                                  {idx + 1}. {source.title}
                                </p>
                                <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                                  {source.text.substring(0, 150)}...
                                </p>
                              </div>
                              <div className="flex-shrink-0">
                                <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full font-medium">
                                  {(source.score * 100).toFixed(0)}%
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {message.contextUsed && !message.sources && (
                    <div className="flex items-center gap-1 mt-3 pt-3 border-t border-gray-200">
                      <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <p className="text-xs text-gray-500 font-medium">Answered using knowledge base</p>
                    </div>
                  )}
                </>
              )}
            </div>
            {message.role === 'user' && (
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-gray-400 to-gray-500 flex items-center justify-center text-white text-sm font-semibold shadow-md">
                You
              </div>
            )}
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start items-start gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white text-sm font-semibold shadow-md">
              AI
            </div>
            <div className="bg-white rounded-2xl rounded-tl-sm p-4 shadow-md border border-gray-100">
              <div className="flex space-x-2">
                <div className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-bounce"></div>
                <div className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="flex gap-3">
        <div className="flex-1 relative">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              workflowVariant === 'video-scripting' || advisorProject
                ? 'Ask about the next scene, narration, or Ultra topics…'
                : 'Ask a question about Blackboard Ultra…'
            }
                    className="w-full px-5 py-4 pr-12 border-2 border-gray-400 rounded-xl focus:outline-none focus:ring-2 focus:ring-black focus:border-black transition-all duration-200 bg-white shadow-sm disabled:bg-gray-50 disabled:cursor-not-allowed"
            disabled={isLoading}
          />
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
                  className="px-8 py-4 bg-black text-white rounded-xl font-semibold shadow-lg hover:shadow-xl hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 transition-all duration-200"
        >
          Send
        </button>
      </form>
    </div>
  );
}

