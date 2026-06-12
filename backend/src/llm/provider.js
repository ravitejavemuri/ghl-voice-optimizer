import { performance } from 'node:perf_hooks';
import OpenAI from 'openai/index.mjs';
import { parseJsonResponse } from './jsonParse.js';
import { ollamaCompleteJson } from './ollamaChat.js';
import { recordLlmMetric } from './llmMetrics.js';

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

function buildOpenAIJsonClient({ apiKey, model }) {
  const client = new OpenAI({ apiKey, model });

  return {
    model,
    async completeJson(system, user, callOptions = {}) {
      const inputChars = system.length + user.length;
      const start = performance.now();
      const res = await client.chat.completions.create({
        model,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        max_tokens: callOptions.maxTokens,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      });
      const text = res.choices[0]?.message?.content ?? '{}';
      const usage = res.usage ?? {};
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

  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const client = buildOpenAIJsonClient({ apiKey, model });

  return {
    name: 'openai',
    model,
    modelLabel: model,
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
  recommend: 900,
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
    const isJsonError = /json|parse|valid|','|'\]'/i.test(err.message);
    if (isJsonError) {
      const bumped =
        callOptions.maxTokens != null
          ? Math.min(2048, Math.ceil(callOptions.maxTokens * 1.5))
          : undefined;
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
