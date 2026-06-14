/**
 * Dot-path utilities for reading, validating, and writing agent config fields.
 * Defines which config paths recommendations may target and formats before/after
 * values for the UI and applyModifications step.
 * Exports: isValidModPath, getPath, setPath, deriveModifiablePaths, parseModAfter.
 */
import { normalizeCategory } from './recommendCategories.js';

const PATH_RE =
  /^(goal|prompt|callScript|temperature|model|voice|tools\.[^.]+\.(description|name|enabled)|knowledgeBase\.[^.]+\.(answer|question)|guardrails\.(escalationTriggers|prohibitedClaims))$/;

export function isValidModPath(path) {
  return PATH_RE.test(String(path ?? '').trim());
}

export function categoryForPath(path) {
  const p = String(path ?? '');
  if (p.startsWith('tools.')) return 'tools';
  if (p.startsWith('knowledgeBase.')) return 'knowledge_base';
  if (p.startsWith('guardrails.')) return 'guardrails';
  if (p === 'callScript') return 'call_script';
  return normalizeCategory(p.split('.')[0]);
}

export function deriveModifiablePaths(agentConfig) {
  const paths = [];
  if (String(agentConfig?.goal ?? '').trim()) paths.push('goal');
  if (String(agentConfig?.prompt ?? '').trim()) paths.push('prompt');
  if (String(agentConfig?.callScript ?? '').trim()) paths.push('callScript');
  if (typeof agentConfig?.temperature === 'number') paths.push('temperature');
  if (agentConfig?.model && agentConfig.model !== 'unknown') paths.push('model');
  if (String(agentConfig?.voice ?? '').trim()) paths.push('voice');

  for (const tool of agentConfig?.tools ?? []) {
    if (tool?.id) paths.push(`tools.${tool.id}.description`);
  }
  for (const entry of agentConfig?.knowledgeBase ?? []) {
    if (entry?.id) paths.push(`knowledgeBase.${entry.id}.answer`);
  }
  const guardrails = agentConfig?.guardrails ?? {};
  if ((guardrails.escalationTriggers ?? []).length) paths.push('guardrails.escalationTriggers');
  if ((guardrails.prohibitedClaims ?? []).length) paths.push('guardrails.prohibitedClaims');

  return paths;
}

export function formatModValue(value) {
  if (value == null) return '';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

/** Wrap a path value in keyed JSON so before/after panels show what field changed. */
export function formatModDisplay(pathStr, value, agentConfig) {
  const path = String(pathStr ?? '').trim();
  if (!path) return formatModValue(value);

  if (path.startsWith('tools.')) {
    const [, toolId, field] = path.split('.');
    const tool = findTool(agentConfig, toolId);
    return JSON.stringify(
      {
        id: toolId,
        name: tool?.name ?? toolId,
        [field]: value ?? '',
      },
      null,
      2
    );
  }

  if (path.startsWith('knowledgeBase.')) {
    const [, entryId, field] = path.split('.');
    const entry = findKbEntry(agentConfig, entryId);
    return JSON.stringify(
      {
        id: entryId,
        question: entry?.question ?? '',
        [field]: value ?? '',
      },
      null,
      2
    );
  }

  if (path.startsWith('guardrails.')) {
    const field = path.split('.')[1];
    const guardrails = agentConfig?.guardrails ?? {};
    const fieldValue = toGuardrailArray(value);
    return JSON.stringify(
      {
        escalationTriggers:
          field === 'escalationTriggers'
            ? fieldValue
            : copyGuardrailArray(guardrails.escalationTriggers),
        prohibitedClaims:
          field === 'prohibitedClaims'
            ? fieldValue
            : copyGuardrailArray(guardrails.prohibitedClaims),
      },
      null,
      2
    );
  }

  if (['goal', 'prompt', 'callScript', 'temperature', 'model', 'voice'].includes(path)) {
    return JSON.stringify({ [path]: value ?? '' }, null, 2);
  }

  return formatModValue(value);
}

function unwrapModAfter(pathStr, text) {
  const path = String(pathStr ?? '').trim();
  if (!path || !text.trim()) return undefined;

  try {
    const parsed = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null) return undefined;

    if (path.startsWith('tools.')) {
      const field = path.split('.')[2];
      if (field in parsed) return parsed[field];
    }

    if (path.startsWith('knowledgeBase.')) {
      const field = path.split('.')[2];
      if (field in parsed) return parsed[field];
    }

    if (path.startsWith('guardrails.')) {
      const field = path.split('.')[1];
      if (field in parsed) return parsed[field];
    }

    const topKey = path.split('.')[0];
    if (topKey in parsed) return parsed[topKey];
  } catch {
    // not JSON — use raw text
  }

  return undefined;
}

function parseArrayModValue(text) {
  if (Array.isArray(text)) {
    return text.map((item) => String(item).trim()).filter(Boolean);
  }

  const trimmed = String(text ?? '').trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter(Boolean);
    }
  } catch {
    // fall through to delimiter parsing
  }

  if (trimmed.includes('\n')) {
    return trimmed
      .split('\n')
      .map((item) => item.replace(/^[-*]\s*/, '').trim())
      .filter(Boolean);
  }

  if (trimmed.includes(',')) {
    return trimmed
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [trimmed];
}

function copyGuardrailArray(value) {
  return Array.isArray(value) ? [...value] : [];
}

function toGuardrailArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return parseArrayModValue(value);
  }
  return [];
}

export function parseModAfter(raw, currentValue, pathStr) {
  const text = String(raw ?? '').trim();
  if (!text) return currentValue;

  const unwrapped = unwrapModAfter(pathStr, text);
  const source = unwrapped !== undefined ? String(unwrapped).trim() : text;

  if (Array.isArray(currentValue)) {
    if (Array.isArray(unwrapped)) {
      return unwrapped.map((item) => String(item).trim()).filter(Boolean);
    }
    return parseArrayModValue(unwrapped !== undefined ? unwrapped : source);
  }

  if (typeof currentValue === 'object' && currentValue !== null) {
    try {
      return JSON.parse(source);
    } catch {
      return unwrapped !== undefined ? unwrapped : text;
    }
  }

  if (typeof currentValue === 'number') {
    const n = Number(unwrapped !== undefined ? unwrapped : source);
    return Number.isFinite(n) ? n : currentValue;
  }

  if (typeof currentValue === 'boolean') {
    const boolText = String(unwrapped !== undefined ? unwrapped : source).toLowerCase();
    if (boolText === 'true') return true;
    if (boolText === 'false') return false;
  }

  return unwrapped !== undefined ? unwrapped : text;
}

function findTool(config, toolId) {
  return (config?.tools ?? []).find((t) => t.id === toolId) ?? null;
}

function findKbEntry(config, entryId) {
  return (config?.knowledgeBase ?? []).find((e) => e.id === entryId) ?? null;
}

export function getPath(config, pathStr) {
  const path = String(pathStr ?? '').trim();
  if (!path) return undefined;

  if (path === 'goal') return config?.goal;
  if (path === 'prompt') return config?.prompt;
  if (path === 'callScript') return config?.callScript;
  if (path === 'temperature') return config?.temperature;
  if (path === 'model') return config?.model;
  if (path === 'voice') return config?.voice;

  if (path.startsWith('tools.')) {
    const [, toolId, field] = path.split('.');
    const tool = findTool(config, toolId);
    return tool?.[field];
  }

  if (path.startsWith('knowledgeBase.')) {
    const [, entryId, field] = path.split('.');
    const entry = findKbEntry(config, entryId);
    return entry?.[field];
  }

  if (path === 'guardrails.escalationTriggers') {
    return copyGuardrailArray(config?.guardrails?.escalationTriggers);
  }
  if (path === 'guardrails.prohibitedClaims') {
    return copyGuardrailArray(config?.guardrails?.prohibitedClaims);
  }

  return undefined;
}

export function setPath(config, pathStr, value) {
  const path = String(pathStr ?? '').trim();
  const next = { ...config };

  if (path === 'goal') return { ...next, goal: String(value ?? '') };
  if (path === 'prompt') return { ...next, prompt: String(value ?? '') };
  if (path === 'callScript') return { ...next, callScript: String(value ?? '') };
  if (path === 'temperature') return { ...next, temperature: value };
  if (path === 'model') return { ...next, model: String(value ?? '') };
  if (path === 'voice') return { ...next, voice: String(value ?? '') };

  if (path.startsWith('tools.')) {
    const [, toolId, field] = path.split('.');
    const tools = [...(next.tools ?? [])];
    const idx = tools.findIndex((t) => t.id === toolId);
    if (idx < 0) return next;
    tools[idx] = { ...tools[idx], [field]: value };
    return { ...next, tools };
  }

  if (path.startsWith('knowledgeBase.')) {
    const [, entryId, field] = path.split('.');
    const knowledgeBase = [...(next.knowledgeBase ?? [])];
    const idx = knowledgeBase.findIndex((e) => e.id === entryId);
    if (idx < 0) return next;
    knowledgeBase[idx] = { ...knowledgeBase[idx], [field]: value };
    return { ...next, knowledgeBase };
  }

  if (path.startsWith('guardrails.')) {
    const field = path.split('.')[1];
    return {
      ...next,
      guardrails: {
        ...(next.guardrails ?? {}),
        escalationTriggers: copyGuardrailArray(next.guardrails?.escalationTriggers),
        prohibitedClaims: copyGuardrailArray(next.guardrails?.prohibitedClaims),
        [field]: toGuardrailArray(value),
      },
    };
  }

  return next;
}

export function valuesEqual(a, b) {
  if (typeof a === 'object' || typeof b === 'object') {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return a === b;
}
