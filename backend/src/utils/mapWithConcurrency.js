/**
 * Bounded-concurrency async map utility for parallel transcript analysis.
 * Runs up to `limit` mapper tasks in flight while preserving result order.
 * Used by transcriptAnalyzer when scoring multiple calls per pipeline run.
 * Exports: mapWithConcurrency.
 */
export async function mapWithConcurrency(items, limit, mapper) {
  if (!items.length) return [];
  const concurrency = Math.max(1, Math.min(limit, items.length));
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}
