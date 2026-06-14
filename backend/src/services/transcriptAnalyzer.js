/**
 * Pipeline stage 2: per-call transcript evaluation against extracted criteria.
 * Scores goal achievement, task completion, objections, strengths, and failures;
 * uses analysis cache and bounded concurrency for multiple calls.
 * Exports: analyzeTranscript, analyzeAllTranscripts.
 */
import { llmJson, LLM_STEP_MAX_TOKENS, resolveTranscriptConcurrency } from '../llm/provider.js';
import { transcriptAnalyzerPrompt } from '../llm/prompts.js';
import { getCachedAnalysis, setCachedAnalysis } from './analysisCache.js';
import { recordLlmMetric } from '../llm/llmMetrics.js';
import { mapWithConcurrency } from '../utils/mapWithConcurrency.js';
import { normalizeObjections } from './objectionNormalize.js';

const SYSTEM = 'Return valid JSON only.';

function normalizeAnalysis(raw, transcript, criteria) {
  const call_id = raw.call_id ?? raw.callId ?? transcript.callId;
  const task_completion = { ...(raw.task_completion ?? {}) };
  for (const task of criteria.required_tasks ?? []) {
    if (!(task in task_completion)) task_completion[task] = false;
  }

  return {
    call_id,
    goal_achieved: Boolean(raw.goal_achieved),
    task_completion,
    objections: normalizeObjections(raw.objections),
    strengths: Array.isArray(raw.strengths) ? raw.strengths.slice(0, 3) : [],
    failures: Array.isArray(raw.failures) ? raw.failures.slice(0, 5) : [],
  };
}

export async function analyzeTranscript(provider, agentConfig, criteria, transcript) {
  const cached = getCachedAnalysis(transcript, criteria);
  if (cached) {
    recordLlmMetric({
      stage: 'transcript_analysis',
      call_id: transcript.callId,
      input_chars: 0,
      estimated_input_tokens: 0,
      output_tokens: 0,
      duration_seconds: 0,
      cached: true,
    });
    return { ...cached, objections: normalizeObjections(cached.objections) };
  }

  const result = await llmJson(provider, SYSTEM, transcriptAnalyzerPrompt(agentConfig, criteria, transcript), {
    stage: 'transcript_analysis',
    callId: transcript.callId,
    maxTokens: LLM_STEP_MAX_TOKENS.transcript,
  });
  const analysis = normalizeAnalysis(result, transcript, criteria);
  setCachedAnalysis(transcript, criteria, analysis);
  return analysis;
}

export async function analyzeAllTranscripts(provider, agentConfig, criteria, transcripts, onProgress) {
  const concurrency = resolveTranscriptConcurrency(provider.name);
  return mapWithConcurrency(transcripts, concurrency, async (transcript, index) => {
    const analysis = await analyzeTranscript(provider, agentConfig, criteria, transcript);
    onProgress?.(analysis, transcript, index, transcripts.length);
    return analysis;
  });
}
