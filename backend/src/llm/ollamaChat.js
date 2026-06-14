/**
 * Ollama-native chat completion for JSON-structured pipeline steps.
 * Calls /api/chat with format:json, optional Qwen3 /no_think prefix, and records
 * timing/token metrics consistent with the OpenAI provider path.
 * Exports: ollamaCompleteJson.
 */
import { performance } from 'node:perf_hooks';
import { parseJsonResponse } from './jsonParse.js';
import { recordLlmMetric } from './llmMetrics.js';

function ollamaNativeBase(baseURL) {
  return baseURL.replace(/\/v1\/?$/, '');
}

function isQwen3Model(model) {
  return /qwen3/i.test(model ?? '');
}

export async function ollamaCompleteJson({
  baseURL,
  model,
  system,
  user,
  maxTokens,
  think = false,
  stage = 'unknown',
  callId = null,
}) {
  const url = `${ollamaNativeBase(baseURL)}/api/chat`;
  const inputChars = system.length + user.length;
  const start = performance.now();

  let systemContent = system;
  if (!think && isQwen3Model(model)) {
    systemContent = `/no_think\n${system}`;
  }

  const body = {
    model,
    stream: false,
    format: 'json',
    think,
    keep_alive: process.env.OLLAMA_KEEP_ALIVE ?? '30m',
    messages: [
      { role: 'system', content: systemContent },
      { role: 'user', content: user },
    ],
    options: {
      num_predict: maxTokens,
      temperature: 0.1,
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Ollama ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = data.message?.content ?? '{}';
  const durationSeconds = (performance.now() - start) / 1000;

  recordLlmMetric({
    stage,
    call_id: callId,
    input_chars: inputChars,
    estimated_input_tokens: data.prompt_eval_count ?? Math.ceil(inputChars / 4),
    prompt_tokens: data.prompt_eval_count ?? 0,
    output_tokens: data.eval_count ?? 0,
    duration_seconds: durationSeconds,
  });

  return parseJsonResponse(text);
}
