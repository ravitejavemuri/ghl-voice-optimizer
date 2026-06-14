/**
 * Disk persistence for optimizer sessions across server restarts.
 * Snapshots pipeline state, active agent config, and uploaded transcripts to
 * .optimizer-session.json; restores them on startup via restorePersistedSession.
 * Exports: savePersistedSession, clearPersistedSession, restorePersistedSession.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { restorePipelineState, snapshotPipelineState } from './store.js';
import { restoreAgentSession, snapshotAgentSession } from './agentRegistry.js';
import { restoreTranscriptSession, snapshotTranscriptSession } from './transcriptRegistry.js';

const SESSION_FILE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../.optimizer-session.json'
);

function readSessionFile() {
  try {
    const raw = fs.readFileSync(SESSION_FILE, 'utf8');
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}

export function savePersistedSession() {
  try {
    const payload = {
      version: 1,
      savedAt: new Date().toISOString(),
      pipeline: snapshotPipelineState(),
      agent: snapshotAgentSession(),
      transcripts: snapshotTranscriptSession(),
    };
    fs.writeFileSync(SESSION_FILE, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  } catch (err) {
    console.warn(`[session] Could not persist session: ${err.message}`);
  }
}

export function clearPersistedSession() {
  try {
    fs.unlinkSync(SESSION_FILE);
  } catch {
    /* no session file */
  }
}

export function restorePersistedSession() {
  const saved = readSessionFile();
  if (!saved) return false;

  restoreAgentSession(saved.agent);
  restoreTranscriptSession(saved.transcripts);
  restorePipelineState(saved.pipeline);

  console.log(
    `[session] Restored session from ${saved.savedAt ?? 'disk'} (${saved.transcripts?.count ?? 0} transcripts, ${saved.pipeline?.analyses?.length ?? 0} analyses)`
  );
  return true;
}
