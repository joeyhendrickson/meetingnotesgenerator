'use client';

import { useState, useEffect } from 'react';

interface DocumentInfo {
  fileId: string;
  name?: string;
  title?: string;
  mimeType?: string;
  modifiedTime?: string;
  chunkCount?: number;
}

interface Chunk {
  id: string;
  chunkIndex: number;
  text: string;
  score: number;
  title: string;
}

export interface DocumentBrowserProps {
  /** `knowledge` = main Drive folder + default Pinecone namespace. `section` = isolated folder + `PINECONE_SECTION_NAMESPACE`. */
  driveScope?: 'knowledge' | 'section';
}

export default function DocumentBrowser({ driveScope = 'knowledge' }: DocumentBrowserProps) {
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<DocumentInfo | null>(null);
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [vectorizing, setVectorizing] = useState<'all' | 'one' | null>(null);
  const [sectionFolderMissing, setSectionFolderMissing] = useState(false);

  useEffect(() => {
    loadDocuments();
  }, []);

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const listUrl =
        driveScope === 'section'
          ? '/api/google-drive/list?scope=section'
          : '/api/google-drive/list';
      const response = await fetch(listUrl);
      const data = await response.json();

      if (response.ok && data.sectionConfigured === false) {
        setSectionFolderMissing(true);
        setDocuments([]);
        setLoading(false);
        return;
      }
      setSectionFolderMissing(false);

      if (response.ok && data.files) {
        setDocuments(data.files);
      } else {
        console.error('Error loading documents:', data.error || data.details || 'Unknown error');
        // Show error to user
        if (data.error || data.details) {
          alert(`Failed to load documents: ${data.error || data.details}\n\nMake sure GOOGLE_DRIVE_FOLDER_ID is set and you have authorized Google Drive access.`);
        }
        setDocuments([]);
      }
    } catch (error) {
      console.error('Error loading documents:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`Failed to load documents: ${errorMessage}\n\nPlease check your browser console for more details.`);
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  };

  const previewDocument = async (document: DocumentInfo) => {
    setSelectedDoc(document);
    setPreviewLoading(true);
    setChunks([]);
    
    try {
      const response = await fetch('/api/documents/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fileId: document.fileId }),
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        setChunks(data.chunks || []);
      } else {
        setChunks([]);
      }
    } catch (error) {
      console.error('Preview error:', error);
      setChunks([]);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    
    try {
      // Upload each file
      const uploadPromises = Array.from(files).map(async (file) => {
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch('/api/google-drive/upload', {
          method: 'POST',
          body: formData,
        });
        
        const data = await response.json();
        
        if (!response.ok) {
          // Include details and technical details if available
          const errorMsg = data.details || data.error || `Failed to upload ${file.name}`;
          const fullError = data.technicalDetails ? `${errorMsg}\n\nTechnical: ${data.technicalDetails}` : errorMsg;
          throw new Error(fullError);
        }
        
        return data;
      });

      const results = await Promise.all(uploadPromises);
      
      // Show success message
      if (results.length === 1) {
        alert(`Successfully uploaded: ${results[0].fileName}`);
      } else {
        alert(`Successfully uploaded ${results.length} files`);
      }

      // Refresh the document list to show the new files
      await loadDocuments();
      
      // Reset the file input
      if (event.target) {
        event.target.value = '';
      }
    } catch (error) {
      console.error('Upload error:', error);
      let errorMessage = 'Unknown error';
      
      if (error instanceof Error) {
        errorMessage = error.message;
        // Check if it's a response error with details
        if (error.message.includes('Failed to upload')) {
          // Try to extract more details from the error
          const match = error.message.match(/details: (.+)/);
          if (match) {
            errorMessage = match[1];
          }
        }
      }
      
      // Show detailed error message
      const errorDetails = errorMessage.split('\n\n');
      const mainError = errorDetails[0];
      const technicalDetails = errorDetails[1];
      
      let alertMessage = `Upload failed: ${mainError}`;
      if (technicalDetails) {
        alertMessage += `\n\nTechnical details:\n${technicalDetails}`;
      }
      alertMessage += `\n\nIf you see authentication errors, you may need to re-authorize Google Drive with write permissions.`;
      
      alert(alertMessage);
    } finally {
      setIsUploading(false);
    }
  };

  const runVectorize = async (fileId?: string) => {
    const mode = fileId ? 'one' : 'all';
    setVectorizing(mode);
    try {
      const response = await fetch('/api/google-drive/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(fileId ? { fileId } : {}),
          ...(driveScope === 'section' ? { scope: 'section' } : {}),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Vectorize failed');
      }
      const okCount = (data.results || []).filter((r: { ok?: boolean }) => r.ok).length;
      const fail = (data.results || []).filter((r: { ok?: boolean }) => !r.ok);
      alert(
        `Vectorize finished.\n${okCount} file(s) succeeded, ${data.totalChunks ?? 0} chunks in index.` +
          (fail.length ? `\n\nFailed: ${fail.map((f: { name?: string; error?: string }) => `${f.name}: ${f.error}`).join('\n')}` : '')
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Vectorize failed');
    } finally {
      setVectorizing(null);
    }
  };

  const handleUploadClick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.pdf,.doc,.docx,.txt,.md';
    input.onchange = (e) => {
      const target = e.target as HTMLInputElement;
      if (target.files) {
        handleFileUpload({ target } as React.ChangeEvent<HTMLInputElement>);
      }
    };
    input.click();
  };

  const filteredDocuments = documents.filter(doc => {
    const docTitle = doc.title || doc.name || 'Untitled Document';
    return docTitle.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <div className="flex flex-col h-[650px] lg:h-[700px]">
      {/* Header */}
      <div className="mb-4">
        {driveScope === 'section' && sectionFolderMissing && (
          <div className="mb-4 rounded-xl border-2 border-amber-400 bg-amber-50 p-4 text-sm text-amber-950">
            <p className="font-semibold">Section folder not configured</p>
            <p className="mt-1 text-amber-900">
              Set <code className="rounded bg-white/80 px-1">GOOGLE_DRIVE_SECTION_FOLDER_ID</code> in{' '}
              <code className="rounded bg-white/80 px-1">.env.local</code> to a Drive folder used only for this
              workspace. Use <code className="rounded bg-white/80 px-1">PINECONE_SECTION_NAMESPACE</code> so vectors
              stay separate from the main knowledge base.
            </p>
          </div>
        )}
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-bold text-gray-800">
            {driveScope === 'section' ? 'Section workspace — Google Drive' : 'Google Drive files'}
          </h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleUploadClick}
              disabled={isUploading}
              className="px-4 py-2 text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="flex items-center gap-2">
                {isUploading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Uploading...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    Upload Files
                  </>
                )}
              </span>
            </button>
            <button
              type="button"
              onClick={loadDocuments}
              disabled={vectorizing !== null}
              className="px-4 py-2 text-sm font-medium text-black hover:bg-black hover:text-white rounded-lg transition-colors disabled:opacity-50"
            >
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </span>
            </button>
            <button
              type="button"
              onClick={() => runVectorize()}
              disabled={vectorizing !== null}
              title="Chunk files, embed with OpenAI, upsert to Pinecone (requires env keys)"
              className="px-4 py-2 text-sm font-medium bg-gray-900 text-white hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {vectorizing === 'all' ? (
                <span className="flex items-center gap-2">
                  <span className="inline-block h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Vectorizing…
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  Vectorize folder
                </span>
              )}
            </button>
          </div>
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search documents..."
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="flex-1 flex gap-4 min-h-0">
        {/* Document List */}
        <div className="w-80 flex-shrink-0 bg-white border border-gray-200 rounded-xl p-4 overflow-y-auto">
          <h3 className="font-semibold text-gray-800 mb-3">
            Documents ({filteredDocuments.length})
          </h3>
          {loading ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-black"></div>
              <p className="text-sm text-gray-500 mt-2">Loading documents...</p>
            </div>
          ) : filteredDocuments.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">
              {searchQuery ? 'No documents match your search' : 'No documents found'}
            </p>
          ) : (
            <div className="space-y-2">
              {filteredDocuments.map((doc) => (
                <div
                  key={doc.fileId}
                  onClick={() => previewDocument(doc)}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedDoc?.fileId === doc.fileId
                      ? 'bg-black border-black'
                      : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  <p className={`text-sm font-medium truncate ${selectedDoc?.fileId === doc.fileId ? 'text-white' : 'text-gray-800'}`} title={doc.title || doc.name || 'Untitled Document'}>
                    {doc.title || doc.name || 'Untitled Document'}
                  </p>
                  <p className={`text-xs mt-1 ${selectedDoc?.fileId === doc.fileId ? 'text-gray-300' : 'text-gray-500'}`}>
                    {doc.mimeType?.includes('pdf') ? 'PDF' :
                     doc.mimeType?.includes('word') ? 'Word' :
                     doc.mimeType?.includes('text') ? 'Text' :
                     'Document'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Preview Panel */}
        <div className="flex-1 bg-white border border-gray-200 rounded-xl p-6 overflow-y-auto">
          {selectedDoc ? (
            <>
              <div className="mb-4 pb-4 border-b border-gray-200">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <h3 className="text-lg font-semibold text-gray-800">{selectedDoc.title || selectedDoc.name || 'Untitled Document'}</h3>
                  <div className="flex flex-wrap items-center gap-2">
                    {chunks.length > 0 && (
                      <span className="text-sm text-gray-600 bg-gray-100 px-3 py-1 rounded-full">
                        {chunks.length} segment{chunks.length !== 1 ? 's' : ''}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => runVectorize(selectedDoc.fileId)}
                      disabled={vectorizing !== null}
                      className="text-sm font-medium px-3 py-1.5 rounded-lg border border-gray-800 text-gray-900 hover:bg-gray-100 disabled:opacity-50"
                    >
                      {vectorizing === 'one' ? 'Vectorizing…' : 'Vectorize this file'}
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-600">
                  <span>File ID: {selectedDoc.fileId}</span>
                  {selectedDoc.modifiedTime && (
                    <span>Modified: {new Date(selectedDoc.modifiedTime).toLocaleDateString()}</span>
                  )}
                </div>
              </div>
              {previewLoading ? (
                <div className="text-center py-12">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-black"></div>
                  <p className="text-sm text-gray-500 mt-2">Loading preview…</p>
                </div>
              ) : chunks.length > 0 ? (
                <div className="space-y-4">
                  {chunks.map((chunk) => (
                    <div
                      key={chunk.id}
                      className="bg-gray-50 border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
                    >
                      <div className="mb-2">
                        <span className="text-xs font-semibold text-gray-500 bg-white px-2 py-1 rounded">
                          Part {chunk.chunkIndex + 1}
                        </span>
                      </div>
                      <div className="whitespace-pre-wrap text-sm text-gray-700 font-sans leading-relaxed">
                        {chunk.text}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  <svg className="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-sm">Could not load a text preview for this file</p>
                  <p className="text-xs mt-2 text-gray-400">Unsupported format, empty file, or Drive access error.</p>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-lg font-medium">Select a document to preview</p>
              <p className="text-sm mt-2">Open a file from your linked Drive folder to preview extracted text</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}





