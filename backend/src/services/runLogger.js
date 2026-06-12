import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const LOGS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../run_logs'
);

function loggingEnabled() {
  return process.env.RUN_LOGS !== 'false';
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

let activeRun = null;

export function startRun({ provider, agentConfig, transcripts }) {
  if (!loggingEnabled()) return null;

  const startedAt = new Date();
  const ts = startedAt.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const providerSlug = String(provider?.name || 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');
  const runId = `${ts}_${providerSlug}`;
  const dir = path.join(LOGS_DIR, runId);

  fs.mkdirSync(path.join(dir, 'analyses'), { recursive: true });

  activeRun = {
    runId,
    dir,
    startedAt: startedAt.toISOString(),
    stepTimings: {},
    manifest: {
      runId,
      status: 'running',
      startedAt: startedAt.toISOString(),
      provider: {
        name: provider?.name ?? null,
        model: provider?.model ?? null,
        modelLabel: provider?.modelLabel ?? null,
      },
      agent: {
        name: agentConfig?.name ?? null,
        goal: agentConfig?.goal ?? null,
      },
      transcripts: transcripts.map((t) => ({
        callId: t.callId,
        turnCount: Array.isArray(t.turns) ? t.turns.length : 0,
      })),
      steps: [],
    },
  };

  writeJson(path.join(dir, 'manifest.json'), activeRun.manifest);
  console.log(`[run-log] Saving run to ${dir}`);
  return activeRun;
}

export function logStep(stepName, data, durationSeconds = null) {
  if (!activeRun) return;

  const entry = {
    step: stepName,
    completedAt: new Date().toISOString(),
    duration_seconds: durationSeconds != null ? Number(durationSeconds.toFixed(1)) : null,
  };
  activeRun.manifest.steps.push(entry);
  if (durationSeconds != null) {
    activeRun.stepTimings[stepName] = Number(durationSeconds.toFixed(1));
  }

  const fileName = {
    goals: '01_goals.json',
    analyses: '02_analyses.json',
    patterns: '03_patterns.json',
    test_cases: '04_test_cases.json',
    recommendations: '05_recommendations.json',
    optimized_agent: '06_optimized_agent.json',
    llm_metrics: 'llm_metrics.json',
  }[stepName];

  if (fileName) {
    writeJson(path.join(activeRun.dir, fileName), data);
  }

  writeJson(path.join(activeRun.dir, 'manifest.json'), {
    ...activeRun.manifest,
    stepTimings: activeRun.stepTimings,
  });
}

export function logTranscriptAnalysis(callId, analysis, index, total) {
  if (!activeRun) return;

  const safeId = String(callId || `call_${index + 1}`).replace(/[^a-zA-Z0-9._-]/g, '_');
  writeJson(path.join(activeRun.dir, 'analyses', `${safeId}.json`), {
    callId,
    index: index + 1,
    total,
    completedAt: new Date().toISOString(),
    analysis,
  });
}

export function finishRun({ llmMetrics } = {}) {
  if (!activeRun) return null;

  const completedAt = new Date().toISOString();
  const manifest = {
    ...activeRun.manifest,
    status: 'complete',
    completedAt,
    stepTimings: activeRun.stepTimings,
    llmMetrics: llmMetrics ?? null,
  };

  writeJson(path.join(activeRun.dir, 'manifest.json'), manifest);
  if (llmMetrics) {
    writeJson(path.join(activeRun.dir, 'llm_metrics.json'), llmMetrics);
  }

  const result = { runId: activeRun.runId, dir: activeRun.dir };
  console.log(`[run-log] Run saved: ${activeRun.dir}`);
  activeRun = null;
  return result;
}

export function failRun(error) {
  if (!activeRun) return null;

  const manifest = {
    ...activeRun.manifest,
    status: 'error',
    completedAt: new Date().toISOString(),
    error: error?.message ?? String(error),
    stepTimings: activeRun.stepTimings,
  };
  writeJson(path.join(activeRun.dir, 'manifest.json'), manifest);

  const result = { runId: activeRun.runId, dir: activeRun.dir };
  console.log(`[run-log] Run failed (partial logs): ${activeRun.dir}`);
  activeRun = null;
  return result;
}
