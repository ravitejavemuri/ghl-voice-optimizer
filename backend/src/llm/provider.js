import { performance } from 'node:perf_hooks';
import OpenAI from 'openai/index.mjs';
import { parseJsonResponse } from './jsonParse.js';
import { ollamaCompleteJson } from './ollamaChat.js';
import { recordLlmMetric } from './llmMetrics.js';
import { getSelectedOpenAIModelId, getSelectedOpenAIModelMeta } from './modelCatalog.js';

function envInt(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function envBool(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(raw).toLowerCase());
}

function usesMaxCompletionTokens(model) {
  return /^(gpt-5|o[0-9])/i.test(String(model ?? ''));
}

/** Total max_completion_tokens for GPT-5/o — must fit reasoning + visible JSON. */
const REASONING_MODEL_TOTAL_BUDGET = {
  goal_extraction: 4096,
  transcript_analysis: 4096,
  pattern_detection: 4096,
  test_generation: 6144,
  recommendations: 16384,
};

function resolveTokenLimit(model, maxTokens, stage) {
  if (!usesMaxCompletionTokens(model)) {
    return { max_tokens: maxTokens ?? 1024 };
  }
  const total = REASONING_MODEL_TOTAL_BUDGET[stage] ?? Math.max(maxTokens ?? 2048, 4096);
  return { max_completion_tokens: total };
}

function openAiRequestOptions(model, callOptions = {}) {
  const opts = {
    model,
    response_format: { type: 'json_object' },
    ...resolveTokenLimit(model, callOptions.maxTokens, callOptions.stage),
  };
  if (usesMaxCompletionTokens(model)) {
    // No internal reasoning burn for structured JSON on GPT-5.x
    opts.reasoning_effort = callOptions.reasoningEffort ?? 'none';
  } else {
    opts.temperature = 0.1;
  }
  return opts;
}

function buildOpenAIJsonClient({ apiKey, model }) {
  const client = new OpenAI({ apiKey, model });

  return {
    model,
    async completeJson(system, user, callOptions = {}) {
      const inputChars = system.length + user.length;
      const start = performance.now();
      const res = await client.chat.completions.create({
        ...openAiRequestOptions(model, callOptions),
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      });
      const choice = res.choices[0];
      const text = choice?.message?.content?.trim() ?? '';
      const usage = res.usage ?? {};
      const reasoningTokens = usage.completion_tokens_details?.reasoning_tokens ?? 0;
      const finish = choice?.finish_reason ?? 'unknown';

      if (!text) {
        throw new Error(
          `No JSON object found (empty content; finish_reason=${finish}; reasoning_tokens=${reasoningTokens})`
        );
      }

      recordLlmMetric({
        stage: callOptions.stage ?? 'unknown',
        call_id: callOptions.callId ?? null,
        input_chars: inputChars,
        estimated_input_tokens: usage.prompt_tokens ?? Math.ceil(inputChars / 4),
        prompt_tokens: usage.prompt_tokens ?? 0,
        output_tokens: usage.completion_tokens ?? 0,
        duration_seconds: (performance.now() - start) / 1000,
      });
      return parseJsonResponse(text);
    },
  };
}

function createOllamaProvider() {
  const model = process.env.OLLAMA_MODEL || 'qwen3:8b';
  const baseURL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1';
  const thinkEnabled = envBool('OLLAMA_THINK', false);
  const defaultMaxTokens = envInt('OLLAMA_MAX_TOKENS', 1024);

  return {
    name: 'ollama',
    model,
    modelLabel: process.env.OLLAMA_MODEL_LABEL || 'Qwen3 8B',
    async completeJson(system, user, callOptions = {}) {
      return ollamaCompleteJson({
        baseURL,
        model,
        system,
        user,
        maxTokens: callOptions.maxTokens ?? defaultMaxTokens,
        think: thinkEnabled,
        stage: callOptions.stage ?? 'unknown',
        callId: callOptions.callId ?? null,
      });
    },
  };
}

function createOpenAIProvider() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const model = getSelectedOpenAIModelId();
  const meta = getSelectedOpenAIModelMeta();
  const client = buildOpenAIJsonClient({ apiKey, model });

  return {
    name: 'openai',
    model,
    modelLabel: meta.label,
    modelTier: meta.tier,
    completeJson: client.completeJson,
  };
}

export function resolveProvider() {
  const explicit = (process.env.LLM_PROVIDER || 'ollama').toLowerCase();

  if (explicit === 'openai') {
    const openai = createOpenAIProvider();
    if (openai) return openai;
    throw new Error('OPENAI_API_KEY is required when LLM_PROVIDER=openai');
  }

  if (explicit === 'ollama' || explicit === 'qwen') {
    return createOllamaProvider();
  }

  const openai = createOpenAIProvider();
  if (openai) return openai;

  return createOllamaProvider();
}

export const LLM_STEP_MAX_TOKENS = {
  goals: 256,
  transcript: 500,
  patterns: 320,
  tests: 800,
  recommend: 4000,
};

export function resolveTranscriptConcurrency(providerName) {
  const raw = process.env.TRANSCRIPT_CONCURRENCY ?? process.env.ANALYZE_CONCURRENCY;
  if (raw != null && raw !== '') {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  if (providerName === 'openai') return 4;
  return 1;
}

export async function llmJson(provider, system, user, callOptions = {}) {
  if (!provider.completeJson) {
    throw new Error(
      'No live AI provider configured. Set LLM_PROVIDER=ollama or openai and ensure the provider is running.'
    );
  }

  const run = (opts) => provider.completeJson(system, user, { ...callOptions, ...opts });
  try {
    return await run();
  } catch (err) {
    const hitLengthLimit = /finish_reason=length|empty content/i.test(err.message);
    const isJsonError = /json|parse|valid|No JSON object found/i.test(err.message);

    if (hitLengthLimit && usesMaxCompletionTokens(provider.model)) {
      console.warn(`[llm] Length retry (${callOptions.stage ?? 'unknown'}): ${err.message}`);
      try {
        return await run({ reasoningEffort: 'none' });
      } catch (retryErr) {
        throw new Error(`${provider.modelLabel || provider.name} failed: ${retryErr.message}`);
      }
    }

    if (isJsonError) {
      const bumped = callOptions.maxTokens != null ? Math.ceil(callOptions.maxTokens * 1.5) : undefined;
      console.warn(
        `[llm] JSON retry (${callOptions.stage ?? 'unknown'}${bumped ? `, maxTokens→${bumped}` : ''}): ${err.message}`
      );
      try {
        return await run(bumped ? { maxTokens: bumped } : {});
      } catch (retryErr) {
        throw new Error(`${provider.modelLabel || provider.name} failed: ${retryErr.message}`);
      }
    }

    throw new Error(`${provider.modelLabel || provider.name} failed: ${err.message}`);
  }
}
