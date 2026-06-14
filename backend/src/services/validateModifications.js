/**
 * Validates and aligns LLM-suggested config modifications before apply.
 * Enforces allowed paths, config-area review flags, non-no-op changes, and
 * deduplication so only actionable edits reach the optimized agent builder.
 * Exports: validateModifications, alignModificationsWithReviews.
 */
import { categoryDisplayLabel, normalizeCategory } from './recommendCategories.js';
import {
  categoryForPath,
  formatModDisplay,
  getPath,
  isValidModPath,
  parseModAfter,
  valuesEqual,
} from './configPaths.js';

export function validateModifications(rawMods, agentConfig, configAreaReviews) {
  const changeKeys = new Set(
    (configAreaReviews ?? []).filter((r) => r.needs_change).map((r) => r.key)
  );
  const seenPaths = new Set();
  const validated = [];

  for (const raw of rawMods ?? []) {
    const path = String(raw.path ?? '').trim();
    if (!path || !isValidModPath(path)) continue;

    const categoryKey = categoryForPath(path);
    if (!changeKeys.has(categoryKey)) continue;
    if (seenPaths.has(path)) continue;

    const current = getPath(agentConfig, path);
    if (current === undefined) continue;

    const afterValue = parseModAfter(raw.after, current);
    if (valuesEqual(current, afterValue)) continue;

    seenPaths.add(path);
    validated.push({
      id: raw.id ?? `mod_${validated.length + 1}`,
      path,
      category: categoryDisplayLabel(categoryKey),
      priority: raw.priority ?? 'Medium',
      issue: raw.issue ?? '',
      before: formatModDisplay(path, current, agentConfig),
      after: formatModDisplay(path, afterValue, agentConfig),
      reason: raw.reason ?? raw.reasoning ?? '',
      expected_impact: raw.expected_impact ?? raw.expectedImpact ?? '',
    });
  }

  return validated;
}

export function alignModificationsWithReviews(modifications, configAreaReviews) {
  const changeKeys = new Set(
    (configAreaReviews ?? []).filter((review) => review.needs_change).map((review) => review.key)
  );

  return (modifications ?? []).filter((mod) => {
    const key = normalizeCategory(mod.category ?? categoryForPath(mod.path));
    if (!changeKeys.has(key)) return false;
    if (mod.before && mod.after && mod.before === mod.after) return false;
    return true;
  });
}
