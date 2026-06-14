/**
 * Applies validated recommendation modifications to a copy of the agent config.
 * Resolves dotted config paths, parses typed after-values, and restructures the
 * optimized prompt for display. Final step after recommendations in the pipeline.
 * Exports: applyModifications, buildOptimizedAgentConfig.
 */
import { structurePrompt } from './promptStructure.js';
import { getPath, parseModAfter, setPath } from './configPaths.js';

export function applyModifications(agentConfig, modifications = []) {
  let next = { ...agentConfig };

  for (const mod of modifications) {
    const path = String(mod.path ?? '').trim();
    if (!path) continue;

    const current = getPath(next, path);
    if (current === undefined) continue;

    const parsed = parseModAfter(mod.after, current, path);
    next = setPath(next, path, parsed);
  }

  if (next.prompt) {
    next = { ...next, prompt: structurePrompt(next.prompt) };
  }

  return {
    ...next,
    _meta: { ...(agentConfig._meta ?? {}), optimized: true, structured: true },
  };
}

/** Build optimized agent from validated modifications (Strategy C). */
export function buildOptimizedAgentConfig(agentConfig, recommendations) {
  const mods = recommendations?.recommendations ?? recommendations?.modifications ?? [];
  return applyModifications(agentConfig, mods);
}
