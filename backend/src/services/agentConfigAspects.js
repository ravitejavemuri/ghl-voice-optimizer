/**
 * Derives and normalizes config-aspect metadata for the recommendation stage.
 * Builds the per-agent checklist of reviewable areas (goal, prompt, tools, etc.)
 * from uploaded JSON so the LLM reviews only fields that exist.
 * Exports: deriveConfigAspects, normalizeConfigAreaReviews, aspectReviewChecklist.
 */
import { categoryDisplayLabel, normalizeCategory } from './recommendCategories.js';

/**
 * Config aspects present in this agent — derived from uploaded JSON, not a fixed list.
 */
export function deriveConfigAspects(agentConfig) {
  const aspects = [];

  const goal = String(agentConfig?.goal ?? '').trim();
  const prompt = String(agentConfig?.prompt ?? '').trim();
  const callScript = String(agentConfig?.callScript ?? '').trim();
  const model = String(agentConfig?.model ?? '').trim();
  const voice = String(agentConfig?.voice ?? '').trim();
  const tools = agentConfig?.tools ?? [];
  const knowledgeBase = agentConfig?.knowledgeBase ?? [];
  const guardrails = agentConfig?.guardrails ?? {};
  const hasGuardrails =
    (guardrails.escalationTriggers ?? []).length > 0 ||
    (guardrails.prohibitedClaims ?? []).length > 0;

  if (goal) {
    aspects.push({
      key: 'goal',
      label: categoryDisplayLabel('goal'),
      configRef: 'AGENT_GOAL',
    });
  }
  if (prompt) {
    aspects.push({
      key: 'prompt',
      label: categoryDisplayLabel('prompt'),
      configRef: 'AGENT_PROMPT',
    });
  }
  if (callScript) {
    aspects.push({
      key: 'call_script',
      label: categoryDisplayLabel('call_script'),
      configRef: 'CALL_SCRIPT',
    });
  }
  if (model && model !== 'unknown') {
    aspects.push({
      key: 'model',
      label: categoryDisplayLabel('model'),
      configRef: 'CURRENT_MODEL',
    });
  }
  if (typeof agentConfig?.temperature === 'number') {
    aspects.push({
      key: 'temperature',
      label: categoryDisplayLabel('temperature'),
      configRef: 'CURRENT_TEMPERATURE',
    });
  }
  if (voice) {
    aspects.push({
      key: 'voice',
      label: categoryDisplayLabel('voice'),
      configRef: 'VOICE',
    });
  }
  if (tools.length > 0) {
    aspects.push({
      key: 'tools',
      label: categoryDisplayLabel('tools'),
      configRef: 'TOOLS',
    });
  }
  if (knowledgeBase.length > 0) {
    aspects.push({
      key: 'knowledge_base',
      label: categoryDisplayLabel('knowledge_base'),
      configRef: 'KNOWLEDGE_BASE',
    });
  }
  if (hasGuardrails) {
    aspects.push({
      key: 'guardrails',
      label: categoryDisplayLabel('guardrails'),
      configRef: 'GUARDRAILS',
    });
  }

  if (!aspects.length) {
    aspects.push({
      key: 'prompt',
      label: categoryDisplayLabel('prompt'),
      configRef: 'AGENT_PROMPT',
    });
  }

  return aspects;
}

export function matchAspectArea(areaName, aspects) {
  const raw = String(areaName ?? '').trim();
  if (!raw) return null;

  const key = normalizeCategory(raw);
  const byKey = aspects.find((a) => a.key === key);
  if (byKey) return byKey;

  const lower = raw.toLowerCase();
  const byLabel = aspects.find((a) => a.label.toLowerCase() === lower);
  if (byLabel) return byLabel;

  return (
    aspects.find(
      (a) =>
        lower.includes(a.key.replace(/_/g, ' ')) ||
        a.label.toLowerCase().includes(lower) ||
        lower.includes(a.label.toLowerCase().split('/')[0].trim())
    ) ?? null
  );
}

const CATEGORY_RULES = {
  goal: '"before" = AGENT_GOAL text (or excerpt); "after" = updated goal text that fixes failure patterns.',
  prompt:
    '"before" = verbatim excerpt from AGENT_PROMPT; "after" = rewritten replacement for that excerpt only.',
  call_script:
    '"before" = verbatim excerpt from CALL_SCRIPT; "after" = rewritten call flow text for that step.',
  temperature:
    '"before" = CURRENT_TEMPERATURE as string; "after" = numeric string (e.g. "0.4") when failures suggest inconsistency.',
  model:
    '"before" = CURRENT_MODEL; "after" = concrete model id when failures suggest weak reasoning or inconsistency.',
  voice: '"before" = VOICE value; "after" = suggested voice id when tone/clarity failures relate to delivery.',
  tools:
    '"before" = that tool\'s TOOLS description, or the AGENT_PROMPT line mentioning that tool id. One recommendation per tool id — never reuse the same before for different tools.',
  knowledge_base:
    '"before" = exact KB answer text from KNOWLEDGE_BASE; "after" = corrected or expanded answer. One recommendation per KB entry when multiple answers are wrong or missing.',
  guardrails:
    '"before" = exact item from GUARDRAILS escalationTriggers[] or prohibitedClaims[], OR full GUARDRAILS JSON for bulk updates. "after" = updated rule string OR full GUARDRAILS JSON (escalationTriggers + prohibitedClaims only). Never use AGENT_PROMPT lines. One recommendation per trigger/claim when possible.',
};

const ASPECT_REVIEW_GUIDANCE = {
  goal: 'Does the goal omit success paths (callback, escalation) that failures show callers needed?',
  prompt:
    'Do tone, boundaries, objection handling, tool-usage, or qualification steps in AGENT_PROMPT explain the failures?',
  call_script:
    'Does CALL_SCRIPT miss steps, confirmations, or branches that failures show callers needed?',
  model:
    'Is CURRENT_MODEL too weak or inconsistent for the booking/compliance complexity in the failures?',
  temperature:
    'Does CURRENT_TEMPERATURE cause drift from script/KB on repeated calls?',
  voice: 'Does VOICE choice affect clarity or trust in the failure scenarios?',
  tools:
    'Review EVERY tool in TOOLS (id, name, description, enabled). Do failures show missing preconditions, wrong tool order, or unclear tool policy?',
  knowledge_base:
    'Review EVERY entry in KNOWLEDGE_BASE. Do failures cite wrong pricing, policy, service area, or FAQ answers?',
  guardrails:
    'Review EVERY escalation trigger and prohibited claim. Do failures show missed escalation, unauthorized guarantees, or compliance gaps?',
};

export function aspectReviewLines(aspects) {
  return aspects
    .map((a, i) => `${i + 1}. ${a.label} (${a.configRef} in agent config below)`)
    .join('\n');
}

export function aspectReviewChecklist(aspects) {
  return aspects
    .map(
      (a, i) =>
        `${i + 1}. ${a.label} [${a.configRef}]: ${ASPECT_REVIEW_GUIDANCE[a.key] ?? ASPECT_REVIEW_GUIDANCE.prompt}`
    )
    .join('\n');
}

export function aspectCategoryRules(aspects) {
  return aspects
    .map((a) => `- ${a.label}: ${CATEGORY_RULES[a.key] ?? CATEGORY_RULES.prompt}`)
    .join('\n');
}

export function aspectCategoryEnum(aspects) {
  return aspects.map((a) => a.label).join(' | ');
}

export function normalizeConfigAreaReviews(raw, agentConfig) {
  const aspects = deriveConfigAspects(agentConfig);
  const byKey = new Map();

  for (const review of raw ?? []) {
    const aspect = matchAspectArea(review.area ?? review.category, aspects);
    const key = aspect?.key ?? normalizeCategory(review.area ?? review.category ?? 'prompt');
    const area = aspect?.label ?? String(review.area ?? review.category ?? 'Config').trim();
    byKey.set(key, {
      key,
      area,
      needs_change: Boolean(review.needs_change ?? review.needsChange),
      note: String(review.note ?? review.summary ?? review.assessment ?? '').trim(),
    });
  }

  const merged = aspects.map((aspect) => {
    if (byKey.has(aspect.key)) return byKey.get(aspect.key);
    return {
      key: aspect.key,
      area: aspect.label,
      needs_change: false,
      note: 'Not reviewed in model response — re-run Analyze.',
    };
  });

  for (const [key, review] of byKey) {
    if (!aspects.some((a) => a.key === key)) {
      merged.push(review);
    }
  }

  return merged;
}
