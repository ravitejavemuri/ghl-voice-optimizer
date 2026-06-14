/**
 * Loads bundled demo fixtures for the Voice AI Optimizer.
 * Reads manifest-driven agent config, generic agent, sample transcripts, and
 * golden examples from ../../fixtures for sample mode and dev smoke tests.
 * Exports: loadFixtures, stripEvalFields.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.resolve(__dirname, '../../fixtures');

function readJson(relativePath) {
  const full = path.join(FIXTURES_DIR, relativePath);
  return JSON.parse(fs.readFileSync(full, 'utf-8'));
}

let cache = null;

export function loadFixtures() {
  if (cache) return cache;

  const manifest = readJson('manifest.json');
  const agentConfig = readJson(manifest.agentConfig);
  const genericAgent = readJson('generic_agent_config.json');
  const transcripts = manifest.transcripts.map((entry) => ({
    ...readJson(entry.file),
    _meta: { scenario: entry.scenario, file: entry.file },
  }));

  const golden = Object.fromEntries(
    Object.entries(manifest.goldenExamples).map(([key, rel]) => [key, readJson(rel)])
  );

  cache = { manifest, agentConfig, genericAgent, transcripts, golden };
  return cache;
}

export function stripEvalFields(transcript) {
  const { expectedIssues, _meta, ...rest } = transcript;
  return rest;
}
