#!/usr/bin/env node
/**
 * Shuffle scenario content across call_1–call_10 so success is not always call_1.
 * Rewrites transcript JSON files and each suite manifest.json.
 *
 * Usage:
 *   node scripts/randomize_test_transcripts.mjs
 *   node scripts/randomize_test_transcripts.mjs --seed 42
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = path.join(ROOT, 'fixtures/test_transcripts');
const SUITES = ['hvac', 'dental', 'auto_service', 'housekeeping'];

function parseArgs() {
  const args = process.argv.slice(2);
  let seed = Date.now();
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--seed') seed = Number(args[++i]) || seed;
  }
  return { seed };
}

/** Mulberry32 — reproducible shuffle per suite. */
function mulberry32(a) {
  return function next() {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function randomizeSuite(suiteDir, rng) {
  const manifestPath = path.join(suiteDir, 'manifest.json');
  const manifest = loadJson(manifestPath);
  const scenarios = manifest.transcripts.map((entry) => {
    const raw = loadJson(path.join(suiteDir, entry.file));
    return {
      scenario: entry.scenario,
      outcome: entry.outcome,
      expectedIssues: entry.expectedIssues,
      turns: raw.turns,
    };
  });

  const shuffled = shuffle(scenarios, rng);
  const newEntries = [];

  for (let i = 0; i < shuffled.length; i++) {
    const slot = i + 1;
    const callId = `call_${slot}`;
    const file = `call_${slot}.json`;
    const item = shuffled[i];
    fs.writeFileSync(
      path.join(suiteDir, file),
      JSON.stringify({ callId, turns: item.turns }, null, 2) + '\n'
    );
    newEntries.push({
      file,
      callId,
      scenario: item.scenario,
      outcome: item.outcome,
      expectedIssues: item.expectedIssues,
    });
  }

  const successSlot = newEntries.find((e) => e.outcome === 'success');
  manifest.transcripts = newEntries;
  manifest.shuffleSeed = rng.seed;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

  return {
    vertical: manifest.vertical,
    successAt: successSlot?.callId ?? '?',
    order: newEntries.map((e) => `${e.callId}=${e.scenario}`),
  };
}

const { seed } = parseArgs();
const summary = [];

for (let i = 0; i < SUITES.length; i++) {
  const suiteDir = path.join(BASE, SUITES[i]);
  const rng = mulberry32(seed + i * 9973);
  rng.seed = seed + i * 9973;
  summary.push(randomizeSuite(suiteDir, rng));
}

const evalManifestPath = path.join(BASE, 'eval_manifest.json');
const evalManifest = loadJson(evalManifestPath);
evalManifest.shuffleSeed = seed;
evalManifest.shuffledAt = new Date().toISOString();
fs.writeFileSync(evalManifestPath, JSON.stringify(evalManifest, null, 2) + '\n');

console.log(`Shuffled test transcripts (seed=${seed})\n`);
for (const row of summary) {
  console.log(`${row.vertical}: success → ${row.successAt}`);
  console.log(`  ${row.order.join(' | ')}\n`);
}
