import { llmJson, LLM_STEP_MAX_TOKENS } from '../llm/provider.js';
import { goalExtractionPrompt } from '../llm/prompts.js';

const SYSTEM = 'Return valid JSON only.';

export async function extractGoals(provider, agentConfig) {
  const script = agentConfig._script ?? '';
  const payload = {
    agent_goal: agentConfig.goal ?? '',
    agent_prompt: agentConfig.prompt ?? '',
    agent_script: script,
  };

  const result = await llmJson(provider, SYSTEM, goalExtractionPrompt({ ...agentConfig, _script: script }), {
    stage: 'goal_extraction',
    maxTokens: LLM_STEP_MAX_TOKENS.goals,
  });

  return {
    required_tasks: result.required_tasks ?? [],
    expected_behaviors: result.expected_behaviors ?? [],
    _input: payload,
  };
}
