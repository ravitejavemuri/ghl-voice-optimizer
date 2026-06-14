import { llmJson, LLM_STEP_MAX_TOKENS } from '../llm/provider.js';
import { recommendationPrompt } from '../llm/prompts.js';
import { categoryDisplayLabel, normalizeCategory } from './recommendCategories.js';
import { normalizeConfigAreaReviews } from './agentConfigAspects.js';
import {
  alignModificationsWithReviews,
  validateModifications,
} from './validateModifications.js';

const SYSTEM =
  'Return valid JSON only. config_area_reviews: one entry per config aspect. modifications ONLY for aspects where needs_change is true. Each modification needs path, before (exact current value), after, issue, reason, expected_impact. No placeholders.';

function mapRawModifications(result) {
  const raw = result?.modifications ?? result?.recommendations ?? [];
  return (raw ?? []).map((m, i) => ({
    id: m.id ?? `mod_${i + 1}`,
    path: m.path ?? '',
    priority: m.priority ?? 'Medium',
    category: m.category ?? '',
    issue: m.issue ?? '',
    before: m.before ?? '',
    after: m.after ?? '',
    reason: m.reason ?? m.reasoning ?? '',
    expected_impact: m.expected_impact ?? m.expectedImpact ?? '',
  }));
}

export async function generateRecommendations(provider, agentConfig, patterns, testCases) {
  const result = await llmJson(
    provider,
    SYSTEM,
    recommendationPrompt(agentConfig, patterns, testCases),
    { stage: 'recommendations', maxTokens: LLM_STEP_MAX_TOKENS.recommend }
  );

  const configAreaReviews = normalizeConfigAreaReviews(result.config_area_reviews, agentConfig);
  const validated = validateModifications(mapRawModifications(result), agentConfig, configAreaReviews);
  const recommendations = alignModificationsWithReviews(validated, configAreaReviews);

  if (!recommendations.length) {
    throw new Error(
      'AI returned no actionable modifications with valid config paths. Re-run Analyze.'
    );
  }

  return {
    agentId: agentConfig.agentId,
    generatedAt: new Date().toISOString(),
    frozenAt: new Date().toISOString(),
    llmModel: provider.model,
    llmModelLabel: provider.modelLabel ?? provider.model,
    configAreaReviews,
    recommendations,
  };
}

export { alignModificationsWithReviews as alignRecommendationsWithReviews };
