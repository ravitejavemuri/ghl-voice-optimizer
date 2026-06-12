const log = [];

export function resetLlmMetrics() {
  log.length = 0;
}

export function recordLlmMetric(entry) {
  const row = {
    stage: entry.stage,
    input_chars: entry.input_chars ?? 0,
    estimated_input_tokens: entry.estimated_input_tokens ?? 0,
    output_tokens: entry.output_tokens ?? 0,
    prompt_tokens: entry.prompt_tokens ?? 0,
    duration_seconds: Number((entry.duration_seconds ?? 0).toFixed(2)),
    cached: Boolean(entry.cached),
    call_id: entry.call_id ?? null,
  };
  log.push(row);
  console.log(`[llm-metrics] ${JSON.stringify(row)}`);
  return row;
}

export function getLlmMetricsSummary() {
  const byStage = {};
  for (const row of log) {
    const key = row.stage;
    if (!byStage[key]) {
      byStage[key] = { calls: 0, cached: 0, duration_seconds: 0, output_tokens: 0 };
    }
    byStage[key].calls += 1;
    byStage[key].cached += row.cached ? 1 : 0;
    byStage[key].duration_seconds += row.duration_seconds;
    byStage[key].output_tokens += row.output_tokens;
  }
  for (const key of Object.keys(byStage)) {
    byStage[key].duration_seconds = Number(byStage[key].duration_seconds.toFixed(1));
  }
  return {
    entries: [...log],
    by_stage: byStage,
    total_duration_seconds: Number(
      log.reduce((sum, r) => sum + r.duration_seconds, 0).toFixed(1)
    ),
  };
}
