import { loadFixtures } from './fixtures.js';

let activeAgent = null;
let source = 'generic';

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export function createGenericAgentConfig() {
  const { genericAgent } = loadFixtures();
  return { ...genericAgent, _meta: { source: 'generic' } };
}

export function normalizeAgentConfig(raw) {
  const data = raw?.agent ?? raw?.agentConfig ?? raw?.config ?? raw;
  if (!isPlainObject(data)) {
    throw new Error('Agent config must be a JSON object');
  }

  const prompt =
    data.prompt ??
    data.system_prompt ??
    data.systemPrompt ??
    data.script ??
    data.instructions ??
    '';

  const goal =
    data.goal ??
    data.objective ??
    data.purpose ??
    data.description ??
    'Achieve the agent\'s intended outcome per its script and policies.';

  if (!String(prompt).trim() && !String(goal).trim()) {
    throw new Error('Agent config needs at least a prompt/script or goal/objective');
  }

  const tools = (data.tools ?? data.actions ?? []).map((t, i) => ({
    id: t.id ?? t.name ?? `tool_${i + 1}`,
    name: t.name ?? t.id ?? `Tool ${i + 1}`,
    description: t.description ?? '',
    enabled: t.enabled !== false,
  }));

  const kb = (data.knowledgeBase ?? data.knowledge_base ?? data.faq ?? []).map((e, i) => ({
    id: e.id ?? `kb_${i + 1}`,
    question: e.question ?? e.q ?? e.title ?? '',
    answer: e.answer ?? e.a ?? e.content ?? '',
  }));

  const guardrails = data.guardrails ?? data.policies ?? {};

  return {
    agentId: data.agentId ?? data.agent_id ?? data.id ?? 'custom_agent',
    name: data.name ?? data.agentName ?? 'Voice AI Agent',
    goal: String(goal).trim(),
    prompt: String(prompt).trim() || String(goal).trim(),
    model: data.model ?? 'unknown',
    temperature: typeof data.temperature === 'number' ? data.temperature : 0.7,
    voice: data.voice ?? '',
    tools,
    knowledgeBase: kb,
    guardrails: {
      escalationTriggers: guardrails.escalationTriggers ?? guardrails.escalation_triggers ?? [],
      prohibitedClaims: guardrails.prohibitedClaims ?? guardrails.prohibited_claims ?? [],
    },
    _meta: { source: 'uploaded' },
  };
}

export function parseAgentPayload(body) {
  const root = body?.data !== undefined ? body.data : body;
  return normalizeAgentConfig(root);
}

export function looksLikeAgentConfig(data) {
  if (!isPlainObject(data)) return false;
  const root = data.agent ?? data.agentConfig ?? data.config ?? data;
  if (!isPlainObject(root)) return false;
  const hasDialogue =
    ['turns', 'messages', 'conversation', 'dialogue', 'utterances'].some((k) =>
      Array.isArray(root[k])
    );
  if (hasDialogue) return false;
  return Boolean(
    root.prompt ??
      root.system_prompt ??
      root.script ??
      root.goal ??
      root.objective ??
      (root.agentId && (root.tools || root.knowledgeBase))
  );
}

export function getActiveAgentConfig() {
  if (!activeAgent) {
    activeAgent = createGenericAgentConfig();
    source = 'generic';
  }
  const { _meta, ...publicConfig } = activeAgent;
  return publicConfig;
}

export function getAgentMeta() {
  getActiveAgentConfig();
  return {
    source,
    agentId: activeAgent.agentId,
    name: activeAgent.name,
    hasCustomPrompt: source !== 'generic',
  };
}

export function setAgentConfig(config) {
  activeAgent = { ...config, _meta: { source: 'uploaded' } };
  source = 'uploaded';
  return getAgentMeta();
}

export function useSampleAgentConfig() {
  const { agentConfig } = loadFixtures();
  activeAgent = { ...agentConfig, _meta: { source: 'sample' } };
  source = 'sample';
  return getAgentMeta();
}

