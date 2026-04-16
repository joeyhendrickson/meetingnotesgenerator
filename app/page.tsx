'use client';

import { useState, useEffect } from 'react';
import ChatInterface from '@/components/ChatInterface';
import GoogleDriveTest from '@/components/GoogleDriveTest';
import DocumentBrowser from '@/components/DocumentBrowser';
import AppMenu from '@/components/AppMenu';
import WebsiteScanner from '@/components/WebsiteScanner';
import Analytics from '@/components/Analytics';
import YouTubeTranscriber from '@/components/YouTubeTranscriber';

export default function Home() {
  const [activeTab, setActiveTab] = useState<'chat' | 'browser'>('chat');
  const [activeApp, setActiveApp] = useState<string | null>(null);
  const [advisorProject, setAdvisorProject] = useState<{
    fileName: string;
    text: string;
  } | null>(null);
  const [projectFlowNonce, setProjectFlowNonce] = useState(0);

  useEffect(() => {
    console.log('✅ Home component mounted successfully!', 'activeTab:', activeTab);
    console.log('✅ React is working, event handlers should be functional');
    
    // Test if we can add event listeners
    const testClick = () => console.log('✅ Click events are working!');
    document.addEventListener('click', testClick, { once: true });
    
    return () => {
      document.removeEventListener('click', testClick);
    };
  }, [activeTab]);

  const handleAppSelect = (app: string) => {
    setActiveApp(app);
    setActiveTab('chat'); // Reset to default tab when switching apps
  };

  return (
    <main className="min-h-screen bg-white" style={{ pointerEvents: 'auto' }}>
      <div className="container mx-auto px-4 py-8 lg:py-12">
        <header className="mb-10 text-center relative">
          <div className="absolute top-0 right-0 z-10">
            <AppMenu onSelectApp={handleAppSelect} />
          </div>
          <h1 className="text-5xl font-extrabold text-black mb-3">
            Ultra Advisor
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Ultra How To Advisor and Web Content Analysis Tool, Powered by AI
          </p>
          <div className="mt-5 flex justify-center">
            <button
              type="button"
              onClick={() => {
                setActiveApp(null);
                setActiveTab('chat');
                setProjectFlowNonce((n) => n + 1);
              }}
              className="inline-flex items-center justify-center px-5 py-2.5 text-sm font-semibold text-black bg-white border-2 border-black rounded-xl shadow-md hover:bg-gray-50 transition-colors"
            >
              New Project
            </button>
          </div>
        </header>

        <div className="max-w-7xl mx-auto">
          {/* Tab Navigation */}
          <div className="flex flex-wrap gap-2 mb-8 bg-white rounded-2xl shadow-lg p-2 border-2 border-black">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('Chat tab clicked');
                setActiveTab('chat');
              }}
              className={`flex-1 min-w-[140px] py-3 px-6 rounded-xl font-semibold transition-all duration-300 ${
                activeTab === 'chat'
                  ? 'bg-black text-white shadow-lg transform scale-105'
                  : 'text-black hover:bg-gray-100 border border-gray-300'
              }`}
            >
              <span className="flex items-center justify-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                ULTRA Advisor
              </span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('Browser tab clicked');
                setActiveTab('browser');
              }}
              className={`flex-1 min-w-[140px] py-3 px-6 rounded-xl font-semibold transition-all duration-300 ${
                activeTab === 'browser'
                  ? 'bg-black text-white shadow-lg transform scale-105'
                  : 'text-black hover:bg-gray-100 border border-gray-300'
              }`}
            >
              <span className="flex items-center justify-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                Vector DB Browser
              </span>
            </button>
          </div>

          {/* Tab Content */}
          <div className="bg-white rounded-2xl shadow-2xl p-6 lg:p-8 border-2 border-black">
            {activeApp === 'website-scanner' ? (
              <WebsiteScanner onBack={() => setActiveApp(null)} />
            ) : activeApp === 'analytics' ? (
              <Analytics onBack={() => setActiveApp(null)} />
            ) : activeApp === 'youtube-transcriber' ? (
              <YouTubeTranscriber onBack={() => setActiveApp(null)} />
            ) : activeTab === 'chat' ? (
              <ChatInterface
                advisorProject={advisorProject}
                onAdvisorProjectChange={setAdvisorProject}
                projectFlowNonce={projectFlowNonce}
              />
            ) : activeTab === 'browser' ? (
              <DocumentBrowser />
            ) : (
              <ChatInterface
                advisorProject={advisorProject}
                onAdvisorProjectChange={setAdvisorProject}
                projectFlowNonce={projectFlowNonce}
              />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

