#!/usr/bin/env node
/**
 * Benchmark the Voice AI Optimizer against labeled test_transcripts suites.
 *
 * Usage (from assignment root):
 *   node scripts/eval_optimizer.mjs
 *   node scripts/eval_optimizer.mjs --suites dental,auto_service,housekeeping
 *   node scripts/eval_optimizer.mjs --suites hvac --out fixtures/test_transcripts/eval_reports/hvac.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import { scoreSuite } from './eval_metrics.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TEST_DIR = path.join(ROOT, 'fixtures/test_transcripts');

const require = createRequire(path.join(ROOT, 'backend/package.json'));
require('dotenv').config({ path: path.join(ROOT, 'backend/.env') });

const { resolveProvider } = await import(pathToFileURL(path.join(ROOT, 'backend/src/llm/provider.js')));
const { runFullPipeline } = await import(pathToFileURL(path.join(ROOT, 'backend/src/services/pipeline.js')));
const { normalizeRawTranscript } = await import(pathToFileURL(path.join(ROOT, 'backend/src/transcriptParse.js')));

function parseArgs() {
  const args = process.argv.slice(2);
  let suites = null;
  let out = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--suites') suites = args[++i]?.split(',').map((s) => s.trim()).filter(Boolean);
    if (args[i] === '--out') out = args[++i];
  }
  return { suites, out };
}

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function loadSuite(suiteDir) {
  const manifest = loadJson(path.join(suiteDir, 'manifest.json'));
  const agent = loadJson(path.join(suiteDir, manifest.agentConfig ?? 'agent.json'));
  const entries = manifest.transcripts;
  const transcripts = entries.map((entry, index) => {
    const raw = loadJson(path.join(suiteDir, entry.file));
    const t = normalizeRawTranscript(raw, index);
    delete t.expectedIssues;
    return t;
  });
  return { manifest, agent, entries, transcripts };
}

function printSuiteSummary(id, label, metrics, targets, durationSec) {
  const oc = metrics.outcome_classification;
  const fa = metrics.failure_awareness;
  const reg = metrics.suite_local_issue_regression;
  const pat = metrics.pattern_detection;
  const tc = metrics.test_coverage;
  console.log(`\n${'='.repeat(56)}`);
  console.log(`${id} — ${label}`);
  console.log(`${'='.repeat(56)}`);
  console.log(`Duration: ${durationSec.toFixed(1)}s | Calls: ${metrics.calls_evaluated}`);
  console.log('\nPrimary (agent-agnostic — goal/outcome judgment):');
  console.log(`  Outcome accuracy:       ${(oc.accuracy * 100).toFixed(1)}%`);
  console.log(`  Failure F1:             ${(oc.f1_failure * 100).toFixed(1)}%  (target ${(targets.outcome_f1 * 100).toFixed(0)}%)`);
  console.log(`  Failure flagged:        ${(fa.failure_flag_rate * 100).toFixed(1)}% of failure calls`);
  console.log(`  Failure explained:      ${(fa.failure_explained_rate * 100).toFixed(1)}% (non-empty failures[])`);
  console.log(`  Success recognized:     ${(fa.success_recognition_rate * 100).toFixed(1)}% of success calls`);
  console.log('\nAdvisory (suite-local slug regression — not comparable across agents):');
  console.log(`  Issue slug micro F1:    ${(reg.micro_f1 * 100).toFixed(1)}%`);
  console.log(`  Pattern slug recall:    ${(pat.pattern_recall * 100).toFixed(1)}%  (${pat.matched}/${pat.expected_count})`);
  console.log(`  Test slug coverage:     ${(tc.test_coverage * 100).toFixed(1)}%  (${tc.test_case_count} tests)`);
}

async function main() {
  const { suites: suiteFilter, out: outPath } = parseArgs();
  const evalManifest = loadJson(path.join(TEST_DIR, 'eval_manifest.json'));
  const targets = evalManifest.metricsTargets ?? {};
  const issueCatalog = evalManifest.issueCatalog ?? [];

  let suites = evalManifest.suites ?? [];
  if (suiteFilter?.length) {
    suites = suites.filter((s) => suiteFilter.includes(s.id));
    if (!suites.length) {
      console.error(`No matching suites for: ${suiteFilter.join(', ')}`);
      process.exit(1);
    }
  }

  const provider = resolveProvider();
  if (!provider.completeJson) {
    console.error('No LLM provider configured. Set LLM_PROVIDER and API keys in backend/.env');
    process.exit(1);
  }

  console.log(`Optimizer eval — provider: ${provider.name} (${provider.modelLabel ?? provider.model})`);
  console.log(`Suites: ${suites.map((s) => s.id).join(', ')}`);

  const report = {
    runAt: new Date().toISOString(),
    promptsVersion: 'v2',
    provider: provider.name,
    model: provider.model ?? provider.modelLabel,
    targets,
    suites: {},
  };

  const totalStart = performance.now();

  for (const suite of suites) {
    const suiteDir = path.join(TEST_DIR, suite.dir);
    const { manifest, agent, entries, transcripts } = loadSuite(suiteDir);
    const start = performance.now();
    console.log(`\n>>> Running pipeline: ${suite.id} (${transcripts.length} calls)…`);

    const result = await runFullPipeline(provider, agent, transcripts);
    const durationSec = (performance.now() - start) / 1000;

    const metrics = scoreSuite({
      entries,
      analyses: result.analyses,
      patterns: result.patterns,
      testCases: result.testCases,
      issueCatalog,
    });

    report.suites[suite.id] = {
      label: manifest.label ?? suite.label,
      duration_seconds: durationSec,
      llm_metrics: result.llmMetrics,
      metrics,
      per_call_outcomes: metrics.outcome_classification.perCall,
    };

    printSuiteSummary(suite.id, manifest.label ?? suite.label, metrics, targets, durationSec);
  }

  report.total_duration_seconds = (performance.now() - totalStart) / 1000;

  const reportsDir = path.join(TEST_DIR, 'eval_reports');
  fs.mkdirSync(reportsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const defaultOut = path.join(reportsDir, `eval_${stamp}.json`);
  const finalOut = outPath ? path.resolve(ROOT, outPath) : defaultOut;
  fs.writeFileSync(finalOut, JSON.stringify(report, null, 2) + '\n');

  console.log(`\n${'='.repeat(56)}`);
  console.log(`Total duration: ${report.total_duration_seconds.toFixed(1)}s`);
  console.log(`Report written: ${finalOut}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
