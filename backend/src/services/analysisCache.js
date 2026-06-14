/**
 * File-backed cache for per-transcript LLM analysis results.
 * Keys analyses by transcript content and evaluation criteria hash to skip
 * redundant calls during re-runs (disable via ANALYSIS_CACHE=false).
 * Exports: getCachedAnalysis, setCachedAnalysis.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const CACHE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../analysis_cache'
);

function cacheEnabled() {
  return process.env.ANALYSIS_CACHE !== 'false';
}

function hashKey(transcript, criteria) {
  const payload = JSON.stringify({
    turns: transcript.turns,
    callId: transcript.callId,
    tasks: criteria.required_tasks,
    behaviors: criteria.expected_behaviors,
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

export function getCachedAnalysis(transcript, criteria) {
  if (!cacheEnabled()) return null;
  try {
    const file = path.join(CACHE_DIR, `${hashKey(transcript, criteria)}.json`);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

export function setCachedAnalysis(transcript, criteria, analysis) {
  if (!cacheEnabled()) return;
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const file = path.join(CACHE_DIR, `${hashKey(transcript, criteria)}.json`);
    fs.writeFileSync(file, JSON.stringify(analysis));
  } catch (err) {
    console.warn(`[analysis-cache] write failed: ${err.message}`);
  }
}
