/** Merge recommendation before/after snippets into a copy of the agent config. */
export function buildOptimizedAgentConfig(agentConfig, recommendations) {
  const recs = recommendations?.recommendations ?? [];
  if (!recs.length) {
    return { ...agentConfig };
  }

  let prompt = agentConfig.prompt ?? '';
  let temperature = agentConfig.temperature;

  for (const rec of recs) {
    const category = (rec.category ?? '').toLowerCase();
    if (category === 'prompt' && rec.after) {
      if (prompt.includes(rec.after)) {
        continue;
      }
      if (rec.before && prompt.includes(rec.before)) {
        prompt = prompt.replace(rec.before, rec.after);
      } else if (!prompt.includes(rec.after)) {
        prompt = `${prompt.trim()}\n\n${rec.after}`;
      }
    } else if (category === 'temperature' && rec.after != null) {
      const next = parseFloat(rec.after);
      if (!Number.isNaN(next)) temperature = next;
    } else if (category === 'escalation' && rec.after) {
      prompt = `${prompt.trim()}\n\nESCALATION UPDATE:\n${rec.after}`;
    } else if (['tools', 'knowledge base', 'model'].includes(category) && rec.after) {
      prompt = `${prompt.trim()}\n\n${rec.category.toUpperCase()} UPDATE:\n${rec.after}`;
    }
  }

  return {
    ...agentConfig,
    prompt,
    temperature,
    _meta: { ...(agentConfig._meta ?? {}), optimized: true },
  };
}
