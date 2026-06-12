import { llmJson, LLM_STEP_MAX_TOKENS } from '../llm/provider.js';
import { testGeneratorPrompt } from '../llm/prompts.js';

const SYSTEM = 'Return valid JSON only.';

function normalizeTestCase(tc) {
  const failureTarget = tc.failure_target ?? tc.failure_category ?? 'observed failure';
  const expected = (tc.expected_behavior ?? []).filter(Boolean);
  const success = (tc.success_criteria ?? []).filter(Boolean);

  if (!expected.length) {
    expected.push(`Agent explicitly addresses: ${failureTarget}.`);
  }
  if (!success.length) {
    success.push(`The failure "${failureTarget}" does not recur.`);
    success.push('Caller can proceed to the next conversation step.');
  }

  return {
    id: tc.id,
    persona: tc.persona ?? '',
    scenario: tc.scenario ?? '',
    failure_target: failureTarget,
    expected_behavior: expected,
    success_criteria: success,
  };
}

export async function generateTestCases(provider, agentConfig, patterns) {
  const result = await llmJson(provider, SYSTEM, testGeneratorPrompt(agentConfig, patterns), {
    stage: 'test_generation',
    maxTokens: LLM_STEP_MAX_TOKENS.tests,
  });

  const cases = result.testCases ?? result;
  if (!Array.isArray(cases) || !cases.length) {
    throw new Error('AI did not return any test cases');
  }

  return {
    agentId: agentConfig.agentId,
    generatedAt: new Date().toISOString(),
    testCases: cases.map((tc, i) =>
      normalizeTestCase({
        ...tc,
        id: tc.id ?? `test_${i + 1}`,
      })
    ),
  };
}
