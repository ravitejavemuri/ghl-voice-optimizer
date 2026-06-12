import { performance } from 'node:perf_hooks';
import { resetLlmMetrics, getLlmMetricsSummary } from '../llm/llmMetrics.js';
import { extractGoals } from './goalExtraction.js';
import { analyzeAllTranscripts } from './transcriptAnalyzer.js';
import { detectPatterns } from './patternDetection.js';
import { generateTestCases } from './tests.js';
import { generateRecommendations } from './recommend.js';
import { buildOptimizedAgentConfig } from './applyRecommendations.js';
import {
  setEvaluationCriteria,
  setAnalyses,
  setPatterns,
  setTestCases,
  setRecommendations,
  setOptimizedAgent,
  setPipelineProgress,
  resetPipelineProgress,
} from '../store.js';
import {
  startRun,
  logStep,
  logTranscriptAnalysis,
  finishRun,
  failRun,
} from './runLogger.js';

export async function runFullPipeline(provider, agentConfig, transcripts) {
  const totalSteps = 4 + transcripts.length;
  let completed = 0;

  const tick = (step, detail, extra = {}) => {
    const percent =
      extra.percent ??
      (totalSteps > 0 ? Math.min(99, Math.round((completed / totalSteps) * 100)) : 0);
    setPipelineProgress({
      running: true,
      step,
      detail,
      current: extra.current ?? completed,
      total: extra.total ?? totalSteps,
      percent,
    });
    console.log(`[pipeline] ${detail}`);
  };

  async function timedStep(step, logKey, detail, fn) {
    tick(step, detail);
    const start = performance.now();
    const result = await fn();
    const duration = (performance.now() - start) / 1000;
    console.log(`[pipeline] ${detail} (${duration.toFixed(1)}s)`);
    logStep(logKey, result, duration);
    return result;
  }

  startRun({ provider, agentConfig, transcripts });

  try {
    resetLlmMetrics();
    resetPipelineProgress();
    setPipelineProgress({ running: true, step: 'goals', total: totalSteps });

    const agentWithScript = {
      ...agentConfig,
      _script: agentConfig._script ?? extractScriptFromPrompt(agentConfig.prompt),
    };

    const goalsStart = performance.now();
    tick('goals', 'Extracting evaluation criteria from agent config…');
    const criteria = await extractGoals(provider, agentWithScript);
    const goalsDuration = (performance.now() - goalsStart) / 1000;
    console.log(
      `[pipeline] Extracting evaluation criteria from agent config… (${goalsDuration.toFixed(1)}s)`
    );
    logStep('goals', criteria, goalsDuration);
    setEvaluationCriteria(criteria);
    completed += 1;

    const analyzeStart = performance.now();
    tick('analyze', `Analyzing ${transcripts.length} transcript(s)…`, {
      current: 0,
      total: transcripts.length,
    });

    const partial = [];
    const allAnalyses = await analyzeAllTranscripts(
      provider,
      agentWithScript,
      criteria,
      transcripts,
      (analysis, transcript, index) => {
        partial[index] = analysis;
        setAnalyses(partial.filter((a) => a != null));
        logTranscriptAnalysis(transcript.callId, analysis, index, transcripts.length);
        completed += 1;
        tick(
          'analyze',
          `Analyzed ${transcript.callId} (${index + 1}/${transcripts.length})…`,
          { current: index + 1, total: transcripts.length }
        );
      }
    );
    setAnalyses(allAnalyses);
    const analyzeDuration = (performance.now() - analyzeStart) / 1000;
    console.log(
      `[pipeline] Transcript analysis complete: ${transcripts.length} call(s) in ${analyzeDuration.toFixed(1)}s`
    );
    logStep('analyses', allAnalyses, analyzeDuration);

    const patternsStart = performance.now();
    tick('patterns', 'Detecting recurring failure patterns…');
    const patterns = await detectPatterns(provider, allAnalyses);
    const patternsDuration = (performance.now() - patternsStart) / 1000;
    console.log(
      `[pipeline] Detecting recurring failure patterns… (${patternsDuration.toFixed(1)}s)`
    );
    logStep('patterns', patterns, patternsDuration);
    setPatterns(patterns);
    completed += 1;

    const testCases = await timedStep(
      'tests',
      'test_cases',
      'Generating test cases from failure patterns…',
      () => generateTestCases(provider, agentWithScript, patterns)
    );
    setTestCases(testCases);
    completed += 1;

    const recommendations = await timedStep(
      'recommend',
      'recommendations',
      'Generating optimization recommendations…',
      () => generateRecommendations(provider, agentWithScript, patterns, testCases)
    );
    setRecommendations(recommendations);
    completed += 1;

    const optimizedAgent = buildOptimizedAgentConfig(agentWithScript, recommendations);
    logStep('optimized_agent', optimizedAgent);
    setOptimizedAgent(optimizedAgent);

    const metrics = getLlmMetricsSummary();
    console.log(`[pipeline] LLM metrics summary: ${JSON.stringify(metrics.by_stage)}`);
    console.log(`[pipeline] Total LLM time: ${metrics.total_duration_seconds}s`);

    setPipelineProgress({
      running: false,
      step: 'done',
      detail: 'Pipeline complete — validate changes in GHL Voice AI',
      percent: 100,
    });

    const runLog = finishRun({ llmMetrics: metrics });

    return {
      evaluationCriteria: criteria,
      analyses: allAnalyses,
      patterns,
      testCases,
      recommendations,
      optimizedAgent,
      provider: provider.name,
      llmMetrics: metrics,
      runLog,
    };
  } catch (err) {
    failRun(err);
    setPipelineProgress({
      running: false,
      step: 'error',
      detail: err.message,
    });
    throw err;
  }
}

function extractScriptFromPrompt(prompt) {
  if (!prompt) return '';
  const marker = '--- CALL SCRIPT / FLOW ---';
  const idx = prompt.indexOf(marker);
  return idx >= 0 ? prompt.slice(idx + marker.length).trim() : '';
}
