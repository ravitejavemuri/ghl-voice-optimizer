const PLACEHOLDER_OBJECTION_TYPES =
  /^(none|n\/a|no objection|no objections?|no objections? raised?|not applicable)$/i;

/** Drop LLM placeholder objections (empty type, "none", etc.). */
export function normalizeObjections(objections) {
  if (!Array.isArray(objections)) return [];

  return objections
    .map((obj) => ({
      type: String(obj?.type ?? '').trim(),
      handled: Boolean(obj?.handled),
    }))
    .filter((obj) => obj.type && !PLACEHOLDER_OBJECTION_TYPES.test(obj.type))
    .slice(0, 5);
}
