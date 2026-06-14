import { stripEvalFields } from './fixtures.js';
import { parseFlexibleTranscriptJson } from './transcriptParse.js';

let activeTranscripts = [];
let source = 'empty';
let uploadMeta = { fileNames: [], uploadedAt: null };

export function parseTranscriptPayload(body) {
  return parseFlexibleTranscriptJson(body);
}

export function getActiveTranscripts() {
  return activeTranscripts;
}

export function getTranscriptById(callId) {
  return activeTranscripts.find((t) => t.callId === callId) ?? null;
}

export function getTranscriptMeta() {
  return {
    source,
    count: activeTranscripts.length,
    fileNames: uploadMeta.fileNames,
    uploadedAt: uploadMeta.uploadedAt,
  };
}

export function listTranscriptSummaries() {
  return getActiveTranscripts().map((t) => ({
    callId: t.callId,
    outcome: t.outcome,
    durationSeconds: t.durationSeconds,
    startedAt: t.startedAt,
    summary: t.summary,
    tags: t.tags,
    turnCount: t.turns.length,
    scenario: t._meta?.scenario,
    source: t._meta?.source ?? source,
  }));
}

function assertUniqueCallIds(transcripts) {
  const ids = new Set();
  for (const t of transcripts) {
    if (ids.has(t.callId)) {
      throw new Error(`Duplicate callId: ${t.callId}`);
    }
    ids.add(t.callId);
  }
}

export function setUploadedTranscripts(transcripts, fileNames = []) {
  if (!transcripts.length) {
    throw new Error('At least one transcript is required');
  }

  assertUniqueCallIds(transcripts);

  activeTranscripts = transcripts;
  source = 'uploaded';
  uploadMeta = {
    fileNames,
    uploadedAt: new Date().toISOString(),
  };

  touchTranscriptSession();
  return getTranscriptMeta();
}

/** Add more transcripts to the current batch (e.g. additional file drops). */
export function appendUploadedTranscripts(transcripts, fileNames = []) {
  if (!transcripts.length) {
    throw new Error('At least one transcript is required');
  }

  const merged = [...activeTranscripts, ...transcripts];
  assertUniqueCallIds(merged);

  activeTranscripts = merged;
  source = 'uploaded';
  uploadMeta = {
    fileNames: [...uploadMeta.fileNames, ...fileNames],
    uploadedAt: new Date().toISOString(),
  };

  touchTranscriptSession();
  return getTranscriptMeta();
}

export function clearTranscripts() {
  activeTranscripts = [];
  source = 'empty';
  uploadMeta = { fileNames: [], uploadedAt: null };
  touchTranscriptSession();
  return getTranscriptMeta();
}

let persistSession = () => {};

export function bindTranscriptSessionPersistence(saveFn) {
  persistSession = typeof saveFn === 'function' ? saveFn : () => {};
}

function touchTranscriptSession() {
  try {
    persistSession();
  } catch {
    /* best-effort */
  }
}

export function snapshotTranscriptSession() {
  return {
    source,
    count: activeTranscripts.length,
    transcripts: activeTranscripts,
    uploadMeta,
  };
}

export function restoreTranscriptSession(saved) {
  if (!saved?.transcripts?.length) return;
  activeTranscripts = saved.transcripts;
  source = saved.source ?? 'uploaded';
  uploadMeta = saved.uploadMeta ?? { fileNames: [], uploadedAt: null };
}

export function getPublicTranscript(callId) {
  const t = getTranscriptById(callId);
  if (!t) return null;
  return stripEvalFields(t);
}
