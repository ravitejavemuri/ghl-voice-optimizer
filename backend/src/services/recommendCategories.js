/**
 * Canonical recommendation category keys and display labels.
 * Normalizes LLM and UI category strings to stable snake_case keys used by
 * configPaths, validateModifications, and the recommendations API response.
 * Exports: RECOMMENDATION_CATEGORIES, normalizeCategory, categoryDisplayLabel.
 */
export const RECOMMENDATION_CATEGORIES = [
  'goal',
  'prompt',
  'call_script',
  'temperature',
  'model',
  'voice',
  'tools',
  'knowledge_base',
  'guardrails',
];

export function normalizeCategory(raw) {
  const c = String(raw ?? 'prompt')
    .toLowerCase()
    .trim()
    .replace(/\s*\/\s*.*$/, '')
    .replace(/\s+/g, '_');

  if (c === 'script' || c === 'flow' || c === 'call_script' || c === 'callscript') {
    return 'call_script';
  }
  if (c === 'objective' || c === 'purpose') return 'goal';
  if (c === 'escalation' || c === 'guardrail' || c === 'guardrails') return 'guardrails';
  if (
    c === 'knowledge_base' ||
    c === 'knowledgebase' ||
    c === 'kb' ||
    c === 'faq' ||
    c.startsWith('knowledge')
  ) {
    return 'knowledge_base';
  }
  if (c === 'tool' || c === 'tools' || c === 'actions' || c === 'action') return 'tools';
  if (RECOMMENDATION_CATEGORIES.includes(c)) return c;
  if (c.startsWith('prompt')) return 'prompt';
  if (c.startsWith('goal')) return 'goal';
  if (c.startsWith('temperature')) return 'temperature';
  if (c.startsWith('model')) return 'model';
  if (c.startsWith('voice')) return 'voice';
  return 'prompt';
}

export function categoryDisplayLabel(category) {
  const key = normalizeCategory(category);
  const labels = {
    goal: 'Goal',
    prompt: 'Prompt / script',
    call_script: 'Call script / flow',
    temperature: 'Temperature',
    model: 'Model',
    voice: 'Voice',
    tools: 'Tools / actions',
    knowledge_base: 'Knowledge base / FAQ',
    guardrails: 'Guardrails / escalation',
  };
  return labels[key] ?? String(category ?? 'Config');
}
