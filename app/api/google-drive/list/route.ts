import { NextRequest, NextResponse } from 'next/server';
import { listFilesInFolder } from '@/lib/google-drive';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const scope = request.nextUrl.searchParams.get('scope');
    const paramFolderId = request.nextUrl.searchParams.get('folderId');

    let folderId: string | undefined;
    let sectionConfigured = true;

    if (scope === 'section') {
      folderId =
        paramFolderId?.trim() ||
        process.env.GOOGLE_DRIVE_SECTION_FOLDER_ID?.trim();
      if (!folderId) {
        sectionConfigured = false;
        return NextResponse.json({
          success: true,
          files: [],
          totalFiles: 0,
          scope: 'section',
          sectionConfigured: false,
        });
      }
    } else {
      folderId =
        paramFolderId?.trim() || process.env.GOOGLE_DRIVE_FOLDER_ID?.trim();
      if (!folderId) {
        return NextResponse.json(
          { error: 'Folder ID is required' },
          { status: 400 }
        );
      }
    }

    const files = await listFilesInFolder(folderId);

    return NextResponse.json({
      success: true,
      files: files.map((file) => ({
        fileId: file.id,
        id: file.id, // Keep for backwards compatibility
        name: file.name,
        title: file.name,
        mimeType: file.mimeType,
        modifiedTime: file.modifiedTime,
      })),
      totalFiles: files.length,
      ...(scope === 'section' ? { scope: 'section', sectionConfigured } : {}),
    });
  } catch (error) {
    console.error('Google Drive list error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return NextResponse.json(
      { 
        error: 'Failed to list Google Drive files',
        details: errorMessage,
      },
      { status: 500 }
    );
  }
}
