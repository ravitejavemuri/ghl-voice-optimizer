import { llmJson, LLM_STEP_MAX_TOKENS } from '../llm/provider.js';
import { recommendationPrompt } from '../llm/prompts.js';
import { normalizeRecommendations } from './recommendNormalize.js';

const SYSTEM =
  'You recommend Voice AI agent optimizations. Respond with valid JSON only. Use exact prompt excerpts for before/after.';

export async function generateRecommendations(provider, agentConfig, patterns, testCases) {
  const result = await llmJson(
    provider,
    SYSTEM,
    recommendationPrompt(agentConfig, patterns, testCases),
    { stage: 'recommendations', maxTokens: LLM_STEP_MAX_TOKENS.recommend }
  );

  if (!result.recommendations?.length) {
    throw new Error('AI did not return any recommendations');
  }

  const mapped = result.recommendations.map((r, i) => ({
    id: r.id ?? `rec_${i + 1}`,
    priority: r.priority ?? 'Medium',
    category: r.category ?? 'Prompt',
    issue: r.issue ?? '',
    before: r.before ?? '',
    after: r.after ?? '',
    reason: r.reason ?? r.reasoning ?? '',
    expected_impact: r.expected_impact ?? r.expectedImpact ?? '',
  }));

  const recommendations = normalizeRecommendations(mapped, agentConfig);
  if (!recommendations.length) {
    throw new Error(
      'AI returned no actionable recommendations with concrete prompt excerpts. Re-run Analyze.'
    );
  }

  return {
    agentId: agentConfig.agentId,
    generatedAt: new Date().toISOString(),
    recommendations,
  };
}
