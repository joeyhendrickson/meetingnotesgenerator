'use client';

import { useState, useEffect } from 'react';
import ChatInterface from '@/components/ChatInterface';
import type { AdvisorProjectFile } from '@/components/ChatInterface';
import DocumentBrowser from '@/components/DocumentBrowser';
import MeetingTranscriptsHub from '@/components/MeetingTranscriptsHub';
import MeetingNotesWorkspace from '@/components/MeetingNotesWorkspace';
import ProgramPlanningWorkspace from '@/components/ProgramPlanningWorkspace';
import AppMenu from '@/components/AppMenu';
import WebsiteScanner from '@/components/WebsiteScanner';
import Analytics from '@/components/Analytics';
import YouTubeTranscriber from '@/components/YouTubeTranscriber';

type MainTab =
  | 'meeting-notes'
  | 'chat'
  | 'video-scripting'
  | 'program-planning'
  | 'browser'
  | 'meeting-transcripts';

export default function Home() {
  const [activeTab, setActiveTab] = useState<MainTab>('meeting-notes');
  const [activeApp, setActiveApp] = useState<string | null>(null);
  const [videoAdvisorProject, setVideoAdvisorProject] = useState<AdvisorProjectFile | null>(null);

  useEffect(() => {
    console.log('✅ Home component mounted successfully!', 'activeTab:', activeTab);
    console.log('✅ React is working, event handlers should be functional');

    const testClick = () => console.log('✅ Click events are working!');
    document.addEventListener('click', testClick, { once: true });

    return () => {
      document.removeEventListener('click', testClick);
    };
  }, [activeTab]);

  const handleAppSelect = (app: string) => {
    setActiveApp(app);
    setActiveTab('chat');
  };

  const tabClass = (tab: MainTab) =>
    `flex-1 min-w-[120px] sm:min-w-[140px] py-3 px-3 sm:px-5 rounded-xl font-semibold transition-all duration-300 text-sm sm:text-base ${
      activeTab === tab
        ? 'bg-black text-white shadow-lg transform scale-[1.02]'
        : 'text-black hover:bg-gray-100 border border-gray-300'
    }`;

  return (
    <main className="min-h-screen bg-white" style={{ pointerEvents: 'auto' }}>
      <div className="container mx-auto px-4 py-8 lg:py-12">
        <header className="mb-10 text-center relative">
          <div className="absolute top-0 right-0 z-10">
            <AppMenu onSelectApp={handleAppSelect} />
          </div>
          <h1 className="text-5xl font-extrabold text-black mb-3">Meeting Notes Generator</h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Upload meeting transcripts in Drive and generate structured Word summaries—one per transcript.
          </p>
        </header>

        <div className="max-w-7xl mx-auto">
          <div className="flex flex-wrap gap-2 mb-8 bg-white rounded-2xl shadow-lg p-2 border-2 border-black">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setActiveTab('meeting-notes');
              }}
              className={tabClass('meeting-notes')}
            >
              <span className="flex items-center justify-center gap-2">
                <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <span className="text-center leading-tight">Transcript summaries</span>
              </span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setActiveTab('chat');
              }}
              className={tabClass('chat')}
            >
              <span className="flex items-center justify-center gap-2">
                <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
                <span className="text-center leading-tight">Chat</span>
              </span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setActiveTab('video-scripting');
              }}
              className={tabClass('video-scripting')}
            >
              <span className="flex items-center justify-center gap-2">
                <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
                <span className="text-center leading-tight">Video Scripting</span>
              </span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setActiveTab('program-planning');
              }}
              className={tabClass('program-planning')}
            >
              <span className="flex items-center justify-center gap-2">
                <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
                  />
                </svg>
                <span className="text-center leading-tight">Program Planning</span>
              </span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setActiveTab('browser');
              }}
              className={tabClass('browser')}
            >
              <span className="flex items-center justify-center gap-2">
                <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                  />
                </svg>
                <span className="text-center leading-tight">Google Drive</span>
              </span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setActiveTab('meeting-transcripts');
              }}
              className={tabClass('meeting-transcripts')}
            >
              <span className="flex items-center justify-center gap-2">
                <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <span className="text-center leading-tight">Meeting transcripts</span>
              </span>
            </button>
          </div>

          <div className="bg-white rounded-2xl shadow-2xl p-6 lg:p-8 border-2 border-black">
            {activeApp === 'website-scanner' ? (
              <WebsiteScanner onBack={() => setActiveApp(null)} />
            ) : activeApp === 'analytics' ? (
              <Analytics onBack={() => setActiveApp(null)} />
            ) : activeApp === 'youtube-transcriber' ? (
              <YouTubeTranscriber onBack={() => setActiveApp(null)} />
            ) : activeTab === 'meeting-notes' ? (
              <MeetingNotesWorkspace />
            ) : activeTab === 'chat' ? (
              <ChatInterface />
            ) : activeTab === 'video-scripting' ? (
              <ChatInterface
                advisorProject={videoAdvisorProject}
                onAdvisorProjectChange={setVideoAdvisorProject}
                workflowVariant="video-scripting"
              />
            ) : activeTab === 'program-planning' ? (
              <ProgramPlanningWorkspace />
            ) : activeTab === 'meeting-transcripts' ? (
              <MeetingTranscriptsHub />
            ) : (
              <DocumentBrowser />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
