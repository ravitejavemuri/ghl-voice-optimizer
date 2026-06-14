/**
 * Pipeline stage 3: aggregate per-call analyses into recurring patterns.
 * Builds an executive summary and asks the LLM for cross-call failure themes,
 * strengths, and missed opportunities to feed test and recommendation stages.
 * Exports: detectPatterns, buildExecutiveSummary.
 */
import { llmJson, LLM_STEP_MAX_TOKENS } from '../llm/provider.js';
import { patternDetectionPrompt } from '../llm/prompts.js';

const SYSTEM = 'Return valid JSON only.';

export function buildExecutiveSummary(analyses) {
  const achieved = analyses.filter((a) => a.goal_achieved).length;
  return {
    calls_analyzed: analyses.length,
    goal_achievement_rate: analyses.length ? Math.round((achieved / analyses.length) * 100) : 0,
  };
}

function matchesIssue(failureText, issueText) {
  const a = String(failureText ?? '').toLowerCase();
  const b = String(issueText ?? '').toLowerCase();
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}

function enrichPatterns(raw, analyses) {
  const recurring_failures = (raw.recurring_failures ?? []).slice(0, 6).map((f) => {
    const affected_calls = analyses
      .filter((a) => (a.failures ?? []).some((fail) => matchesIssue(fail, f.issue)))
      .map((a) => a.call_id);
    return {
      issue: f.issue ?? '',
      frequency: f.frequency ?? affected_calls.length,
      severity: f.severity ?? 'Medium',
      affected_calls,
      business_impact: f.business_impact ?? 'Reduces goal completion rate',
    };
  });

  const recurring_strengths = (raw.recurring_strengths ?? []).slice(0, 4).map((s) => ({
    issue: s.issue ?? '',
    frequency: s.frequency ?? 0,
  }));

  const missed_opportunities = recurring_failures
    .slice(0, 5)
    .map((f) => `Address: ${f.issue}`);

  return { recurring_failures, recurring_strengths, missed_opportunities };
}

export async function detectPatterns(provider, analyses) {
  const executiveSummary = buildExecutiveSummary(analyses);

  const patterns = await llmJson(provider, SYSTEM, patternDetectionPrompt(analyses), {
    stage: 'pattern_detection',
    maxTokens: LLM_STEP_MAX_TOKENS.patterns,
  });

  const enriched = enrichPatterns(patterns, analyses);

  return {
    executiveSummary,
    ...enriched,
  };
}
