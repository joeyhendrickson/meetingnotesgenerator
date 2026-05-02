import { config } from 'dotenv';
import { resolve } from 'path';
import {
  syncDriveFolderToPinecone,
  isKnowledgeBaseConfigured,
  type KnowledgeScope,
} from '../lib/knowledge-base';

config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

async function main() {
  if (!isKnowledgeBaseConfigured()) {
    console.error(
      'Missing Pinecone env. Set PINECONE_API_KEY and PINECONE_INDEX_NAME in .env.local'
    );
    process.exit(1);
  }

  const fileArg = process.argv.find((a) => a.startsWith('--file='));
  const fileId = fileArg?.split('=')[1]?.trim() || undefined;
  const scopeArg = process.argv.find((a) => a.startsWith('--scope='));
  const scopeRaw = scopeArg?.split('=')[1]?.trim().toLowerCase();
  const scope: KnowledgeScope = scopeRaw === 'section' ? 'section' : 'knowledge';

  console.log(
    fileId
      ? `Vectorizing file ${fileId} (scope=${scope})…`
      : `Vectorizing Google Drive folder (scope=${scope})…`
  );

  const { results, totalChunks } = await syncDriveFolderToPinecone(
    fileId ? { fileId, scope } : { scope }
  );

  for (const r of results) {
    if (r.ok) {
      console.log(
        `  ✓ ${r.name} (${r.fileId}) — ${r.chunks ?? 0} chunks${r.error ? ` (${r.error})` : ''}`
      );
    } else {
      console.error(`  ✗ ${r.name} (${r.fileId}): ${r.error || 'failed'}`);
    }
  }

  console.log(`\nDone. ${results.length} file(s), ${totalChunks} chunk vectors upserted.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
