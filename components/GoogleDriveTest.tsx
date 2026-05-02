'use client';

import { useState } from 'react';

export default function GoogleDriveTest() {
  const [status, setStatus] = useState<string>('');
  const [files, setFiles] = useState<any[]>([]);
  const [folderId, setFolderId] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleGetAuthUrl = async () => {
    try {
      const response = await fetch('/api/auth/google');
      
      // Check if response is actually JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        setStatus(`❌ Error: Server returned HTML instead of JSON. This usually means the API route crashed. Check the server console for errors. Status: ${response.status}`);
        console.error('Non-JSON response:', text.substring(0, 200));
        return;
      }
      
      const data = await response.json();
      
      if (data.authUrl) {
        window.open(data.authUrl, '_blank');
        setStatus('✅ Authorization URL opened in new tab. Please authorize the application.');
      } else {
        const errorMsg = data.error || 'Failed to get auth URL';
        const details = data.details ? `\n\nDetails: ${data.details}` : '';
        const hint = data.hint ? `\n\n${data.hint}` : '';
        setStatus(`❌ Error: ${errorMsg}${details}${hint}`);
      }
    } catch (error) {
      if (error instanceof SyntaxError && error.message.includes('JSON')) {
        setStatus('❌ Error: Server returned invalid JSON. Check the server console for errors. Make sure your environment variables are set correctly.');
      } else {
        setStatus('❌ Error: ' + (error instanceof Error ? error.message : 'Unknown error'));
      }
      console.error('Error details:', error);
    }
  };

  const handleTestConnection = async () => {
    if (!folderId.trim()) {
      setStatus('❌ Please enter a folder ID');
      return;
    }

    setIsLoading(true);
    setStatus('Testing connection...');
    try {
      const response = await fetch(`/api/google-drive/list?folderId=${folderId}`);

      const data = await response.json();

      if (response.ok) {
        setFiles(data.files || []);
        setStatus(
          `✅ Connection successful! Found ${data.totalFiles} file(s) in the folder.`
        );
      } else {
        const errorMsg = data.error || 'Failed to connect';
        const details = data.details ? `\n\nDetails: ${data.details}` : '';
        setStatus(`❌ Error: ${errorMsg}${details}`);
        setFiles([]);
      }
    } catch (error) {
      setStatus('❌ Error: ' + (error instanceof Error ? error.message : 'Unknown error'));
      setFiles([]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 bg-gradient-to-br from-black to-black rounded-xl flex items-center justify-center shadow-lg">
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
          </svg>
        </div>
        <h3 className="text-3xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent">
          Google Drive Connection Setup
        </h3>
      </div>

      {/* Authorization Section */}
      <div className="space-y-6">
        <div className="bg-gradient-to-br from-black to-black rounded-2xl p-6 border border-black">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-black rounded-lg flex items-center justify-center text-white font-bold shadow-md">
              1
            </div>
            <h4 className="text-xl font-bold text-white">Authorize Application</h4>
          </div>
          <p className="text-white mb-4 leading-relaxed">
            Click the button below to authorize this application to access your Google Drive.
            This will open Google&apos;s authorization page in a new tab.
          </p>
          <button
            onClick={handleGetAuthUrl}
            className="px-6 py-3 bg-gradient-to-r from-black to-black text-white rounded-xl font-semibold shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200 flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Get Authorization URL
          </button>
        </div>

        <div className="bg-gradient-to-br from-amber-50 to-yellow-50 border-2 border-amber-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-amber-900 font-medium mb-1">After authorizing:</p>
              <p className="text-sm text-amber-800">
                Check the callback URL in the new tab. You should see a JSON response with a <code className="px-1.5 py-0.5 bg-amber-100 rounded text-xs font-mono">refresh_token</code>. 
                Copy that token and add it to your <code className="px-1.5 py-0.5 bg-amber-100 rounded text-xs font-mono">.env.local</code> file as <code className="px-1.5 py-0.5 bg-amber-100 rounded text-xs font-mono">GOOGLE_REFRESH_TOKEN</code>.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Connection Test Section */}
      <div className="bg-gradient-to-br from-black to-black rounded-2xl p-6 border border-black">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-black rounded-lg flex items-center justify-center text-white font-bold shadow-md">
            2
          </div>
          <h4 className="text-xl font-bold text-white">Test Connection</h4>
        </div>
        <p className="text-white mb-4 leading-relaxed">
          Enter your Google Drive folder ID and click &quot;Test Connection&quot; to verify the connection works and list files in the folder.
        </p>
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <input
              type="text"
              value={folderId}
              onChange={(e) => setFolderId(e.target.value)}
              placeholder="Enter Google Drive folder ID"
              className="w-full px-4 py-3 pr-12 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all duration-200 bg-white shadow-sm"
            />
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
              </svg>
            </div>
          </div>
          <button
            onClick={handleTestConnection}
            disabled={isLoading}
            className="px-8 py-3 bg-gradient-to-r from-black to-black text-white rounded-xl font-semibold shadow-lg hover:shadow-xl hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 transition-all duration-200 flex items-center gap-2"
          >
            {isLoading ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Testing...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Test Connection</span>
              </>
            )}
          </button>
        </div>
        <p className="text-xs text-white mt-3 flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Tip: Find your folder ID in the Google Drive URL: <code className="px-1.5 py-0.5 rounded text-xs font-mono">drive.google.com/drive/folders/FOLDER_ID</code>
        </p>
      </div>

      {/* Status Display */}
      {status && (
        <div
          className={`rounded-xl p-5 shadow-md ${
            status.startsWith('✅')
              ? 'bg-gradient-to-br from-black to-black border-2 border-black'
              : 'bg-gradient-to-br from-red-50 to-rose-50 border-2 border-red-200'
          }`}
        >
          <div className="flex items-start gap-3">
            {status.startsWith('✅') ? (
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-black flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
            ) : (
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-red-500 flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
            )}
            <p className={`text-sm font-medium ${status.startsWith('✅') ? 'text-white' : 'text-red-800'}`}>{status}</p>
          </div>
        </div>
      )}

      {/* Files List */}
      {files.length > 0 && (
        <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
          <h4 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Files Found ({files.length})
          </h4>
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {files.map((file, index) => (
              <div key={index} className="bg-gradient-to-r from-gray-50 to-white p-4 rounded-lg border border-gray-200 hover:border-black hover:shadow-md transition-all duration-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-black rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-800 truncate">{file.name}</p>
                    <p className="text-xs text-gray-500 truncate">ID: {file.id}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

