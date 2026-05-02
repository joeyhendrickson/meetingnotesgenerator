import { Pinecone } from '@pinecone-database/pinecone';
import { getOpenAIClient } from './openai';
import {
  getGoogleDriveClient,
  getFileContent,
  listFilesInFolder,
} from './google-drive';
import { extractTextFromDocument } from './document-processor';

export const KB_EMBEDDING_MODEL = 'text-embedding-3-small';
export const KB_EMBEDDING_DIMENSIONS = 1536;
const MAX_CHUNK_CHARS = 2200;
const MIN_MERGE_CHARS = 120;
const METADATA_TEXT_CAP = 6000;
const EMBED_BATCH = 48;

let pineconeIndex: ReturnType<Pinecone['index']> | null = null;

/** Main advisor knowledge base (Chat / Google Drive tab). */
export type KnowledgeScope = 'knowledge' | 'section';

export function isKnowledgeBaseConfigured(): boolean {
  return Boolean(
    process.env.PINECONE_API_KEY?.trim() && process.env.PINECONE_INDEX_NAME?.trim()
  );
}

/** Pinecone + section namespace env (folder not required for queries). */
export function isSectionRagConfigured(): boolean {
  return (
    isKnowledgeBaseConfigured() && Boolean(process.env.PINECONE_SECTION_NAMESPACE?.trim())
  );
}

export function isScopeQueryable(scope: KnowledgeScope): boolean {
  if (!isKnowledgeBaseConfigured()) return false;
  if (scope === 'section') return isSectionRagConfigured();
  return true;
}

function getPineconeIndex() {
  if (!isKnowledgeBaseConfigured()) return null;
  if (!pineconeIndex) {
    const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY!.trim() });
    pineconeIndex = pc.index(process.env.PINECONE_INDEX_NAME!.trim());
  }
  return pineconeIndex;
}

function pineconeNamespaceForScope(scope: KnowledgeScope): string {
  if (scope === 'section') {
    const n = process.env.PINECONE_SECTION_NAMESPACE?.trim();
    if (!n) {
      throw new Error(
        'PINECONE_SECTION_NAMESPACE must be set for section RAG (dedicated Pinecone namespace, separate from the main knowledge base).'
      );
    }
    return n;
  }
  return (process.env.PINECONE_NAMESPACE || '').trim();
}

function folderIdForSync(scope: KnowledgeScope): string {
  if (scope === 'section') {
    const id = process.env.GOOGLE_DRIVE_SECTION_FOLDER_ID?.trim();
    if (!id) {
      throw new Error(
        'GOOGLE_DRIVE_SECTION_FOLDER_ID is required to sync the isolated section folder.'
      );
    }
    return id;
  }
  const id = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim();
  if (!id) {
    throw new Error('GOOGLE_DRIVE_FOLDER_ID is required for Drive sync.');
  }
  return id;
}

/** Paragraph-oriented chunks suitable for embedding and retrieval. */
export function chunkTextForKnowledgeBase(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const paragraphs = normalized.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let carry = '';

  const flushCarry = () => {
    const t = carry.trim();
    if (t) chunks.push(t);
    carry = '';
  };

  const splitOversized = (body: string): string[] => {
    if (body.length <= MAX_CHUNK_CHARS) return [body];
    const parts: string[] = [];
    for (let i = 0; i < body.length; i += MAX_CHUNK_CHARS) {
      const slice = body.slice(i, i + MAX_CHUNK_CHARS).trim();
      if (slice) parts.push(slice);
    }
    return parts;
  };

  for (const p of paragraphs) {
    for (const piece of splitOversized(p)) {
      if (!carry) {
        carry = piece;
        continue;
      }
      if (carry.length + 2 + piece.length <= MAX_CHUNK_CHARS) {
        carry = `${carry}\n\n${piece}`;
      } else {
        if (carry.length < MIN_MERGE_CHARS && chunks.length > 0) {
          const prev = chunks.pop()!;
          carry = `${prev}\n\n${carry}`;
        }
        flushCarry();
        carry = piece;
      }
    }
  }
  if (carry.length < MIN_MERGE_CHARS && chunks.length > 0) {
    const prev = chunks.pop()!;
    carry = `${prev}\n\n${carry}`;
  }
  flushCarry();

  return chunks;
}

function truncateForMetadata(text: string): string {
  if (text.length <= METADATA_TEXT_CAP) return text;
  return `${text.slice(0, METADATA_TEXT_CAP)}\n…`;
}

export async function embedTextsForKnowledgeBase(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const client = getOpenAIClient();
  const vectors: number[][] = new Array(texts.length);
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const batch = texts.slice(i, i + EMBED_BATCH);
    const res = await client.embeddings.create({
      model: KB_EMBEDDING_MODEL,
      input: batch,
      dimensions: KB_EMBEDDING_DIMENSIONS,
    });
    const sorted = [...res.data].sort((a, b) => a.index - b.index);
    for (let j = 0; j < sorted.length; j += 1) {
      vectors[i + j] = sorted[j].embedding;
    }
  }
  return vectors;
}

export type KnowledgeHit = {
  id: string;
  title: string;
  text: string;
  score: number;
  fileId: string;
  chunkIndex: number;
};

export async function queryKnowledgeBase(
  query: string,
  topK = 5,
  scope: KnowledgeScope = 'knowledge'
): Promise<KnowledgeHit[]> {
  const index = getPineconeIndex();
  if (!index || !query.trim()) return [];
  if (!isScopeQueryable(scope)) return [];

  const [qVec] = await embedTextsForKnowledgeBase([query.trim()]);
  if (!qVec) return [];

  let ns: string;
  try {
    ns = pineconeNamespaceForScope(scope);
  } catch {
    return [];
  }

  const res = await index.namespace(ns).query({
    vector: qVec,
    topK,
    includeMetadata: true,
  });

  const hits: KnowledgeHit[] = [];
  for (const m of res.matches || []) {
    const meta = (m.metadata || {}) as Record<string, unknown>;
    const title = typeof meta.title === 'string' ? meta.title : 'Document';
    const text = typeof meta.text === 'string' ? meta.text : '';
    const fileId = typeof meta.fileId === 'string' ? meta.fileId : '';
    const chunkIndex =
      typeof meta.chunkIndex === 'number'
        ? meta.chunkIndex
        : typeof meta.chunkIndex === 'string'
          ? parseInt(meta.chunkIndex, 10) || 0
          : 0;
    const id = typeof m.id === 'string' ? m.id : `${fileId}-${chunkIndex}`;
    const score = typeof m.score === 'number' ? m.score : 0;
    if (text) {
      hits.push({ id, title, text, score, fileId, chunkIndex });
    }
  }
  return hits;
}

export async function deleteKnowledgeVectorsForFile(
  fileId: string,
  scope: KnowledgeScope = 'knowledge'
): Promise<void> {
  const index = getPineconeIndex();
  if (!index) return;
  const ns = pineconeNamespaceForScope(scope);
  await index.namespace(ns).deleteMany({ filter: { fileId: { $eq: fileId } } });
}

export async function upsertFileChunks(params: {
  fileId: string;
  title: string;
  chunks: string[];
  scope?: KnowledgeScope;
}): Promise<number> {
  const index = getPineconeIndex();
  if (!index || params.chunks.length === 0) return 0;

  const scope = params.scope ?? 'knowledge';
  const vectors = await embedTextsForKnowledgeBase(params.chunks);
  const ns = pineconeNamespaceForScope(scope);
  const records = params.chunks.map((chunkText, chunkIndex) => ({
    id: `${params.fileId}_${chunkIndex}`,
    values: vectors[chunkIndex],
    metadata: {
      fileId: params.fileId,
      title: params.title,
      chunkIndex,
      text: truncateForMetadata(chunkText),
    },
  }));

  await index.namespace(ns).upsert(records);
  return records.length;
}

export type SyncFileResult = {
  fileId: string;
  name: string;
  ok: boolean;
  chunks?: number;
  error?: string;
};

export type SyncFolderResult = {
  results: SyncFileResult[];
  totalChunks: number;
};

/**
 * Downloads Drive files, chunks text, embeds, and upserts into Pinecone.
 * When `fileId` is set, only that file is synced; otherwise the whole folder.
 */
export async function syncDriveFolderToPinecone(options?: {
  fileId?: string;
  scope?: KnowledgeScope;
}): Promise<SyncFolderResult> {
  if (!isKnowledgeBaseConfigured()) {
    throw new Error(
      'Pinecone is not configured. Set PINECONE_API_KEY and PINECONE_INDEX_NAME.'
    );
  }

  const scope: KnowledgeScope = options?.scope ?? 'knowledge';
  const folderId = folderIdForSync(scope);

  const drive = await getGoogleDriveClient();
  let files = await listFilesInFolder(folderId);

  if (options?.fileId) {
    files = files.filter((f) => f.id === options.fileId);
    if (files.length === 0) {
      const one = await drive.files.get({
        fileId: options.fileId,
        fields: 'id, name, mimeType, modifiedTime',
      });
      if (one.data.id) {
        files = [
          {
            id: one.data.id,
            name: one.data.name || undefined,
            mimeType: one.data.mimeType || undefined,
            modifiedTime: one.data.modifiedTime || undefined,
          },
        ];
      }
    }
  }

  const results: SyncFileResult[] = [];
  let totalChunks = 0;

  for (const f of files) {
    const fileId = f.id || '';
    const name = f.name || 'Untitled';
    if (!fileId) {
      results.push({ fileId: '', name, ok: false, error: 'Missing file id' });
      continue;
    }

    try {
      const mimeType = f.mimeType || 'application/octet-stream';
      const buffer = await getFileContent(fileId, mimeType);
      const text = await extractTextFromDocument(buffer, mimeType, name);
      const chunks = chunkTextForKnowledgeBase(text);

      await deleteKnowledgeVectorsForFile(fileId, scope);

      if (chunks.length === 0) {
        results.push({
          fileId,
          name,
          ok: true,
          chunks: 0,
          error: 'No extractable text',
        });
        continue;
      }

      const n = await upsertFileChunks({ fileId, title: name, chunks, scope });
      totalChunks += n;
      results.push({ fileId, name, ok: true, chunks: n });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      results.push({ fileId, name, ok: false, error: msg });
    }
  }

  return { results, totalChunks };
}
