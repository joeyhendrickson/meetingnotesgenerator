import { NextRequest, NextResponse } from 'next/server';
import { uploadFileToGoogleDrive } from '@/lib/google-drive';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const folderIdParam = (formData.get('folderId') as string | null)?.trim() || null;
    const scope = (formData.get('scope') as string | null)?.trim();

    let folderId: string | null = folderIdParam;
    if (scope === 'section') {
      folderId = process.env.GOOGLE_DRIVE_SECTION_FOLDER_ID?.trim() || null;
      if (!folderId) {
        return NextResponse.json(
          {
            error: 'Section folder not configured',
            details: 'Set GOOGLE_DRIVE_SECTION_FOLDER_ID to upload into the meeting transcripts folder.',
          },
          { status: 400 }
        );
      }
    }

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Read file content
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Determine MIME type from file
    const mimeType = file.type || 'application/octet-stream';

    // Upload to Google Drive
    const result = await uploadFileToGoogleDrive(
      file.name,
      buffer,
      mimeType,
      folderId?.trim() || undefined
    );

    return NextResponse.json({
      success: true,
      fileId: result.fileId,
      fileName: file.name,
      webViewLink: result.webViewLink,
    });
  } catch (error) {
    console.error('Google Drive upload error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Provide more helpful error messages
    let userFriendlyError = errorMessage;
    
    if (errorMessage.includes('refresh access token') || errorMessage.includes('invalid_grant')) {
      userFriendlyError = 'Google Drive authentication failed. Please re-authorize the application with write permissions. Visit /api/auth/google to get a new authorization URL.';
    } else if (errorMessage.includes('insufficientFilePermissions') || errorMessage.includes('403')) {
      userFriendlyError = 'Insufficient permissions. Make sure your Google OAuth app has write access to Google Drive. You may need to re-authorize with the correct scopes.';
    } else if (errorMessage.includes('GOOGLE_DRIVE_FOLDER_ID')) {
      userFriendlyError = 'Google Drive folder ID not configured. Please set GOOGLE_DRIVE_FOLDER_ID in your environment variables.';
    }
    
    return NextResponse.json(
      { 
        error: 'Failed to upload file to Google Drive',
        details: userFriendlyError,
        technicalDetails: errorMessage,
      },
      { status: 500 }
    );
  }
}

