/**
 * Prompt templates for each Voice AI Optimizer pipeline LLM stage.
 * Builds JSON-serialized inputs for goal extraction, transcript scoring, pattern
 * detection, test generation, and config recommendations (v2; see prompts.backup.js).
 * Exports: goalExtractionPrompt, transcriptAnalyzerPrompt, patternDetectionPrompt, etc.
 */
import { formatTranscriptForLlm } from './transcriptTrim.js';
import {
  deriveConfigAspects,
  aspectReviewChecklist,
  aspectCategoryEnum,
} from '../services/agentConfigAspects.js';
import { deriveModifiablePaths } from '../services/configPaths.js';

const MAX_GOAL_PROMPT = 1800;
const MAX_GOAL_SCRIPT = 800;
const MAX_AGENT_SNIPPET = 600;

export function goalExtractionPrompt(agentConfig) {
  const input = {
    agent_goal: (agentConfig.goal ?? '').slice(0, 400),
    agent_prompt: (agentConfig.prompt ?? '').slice(0, MAX_GOAL_PROMPT),
    agent_script: (agentConfig._script ?? '').slice(0, MAX_GOAL_SCRIPT),
  };
  return `${JSON.stringify(input)}

Return JSON only: {"required_tasks":["snake_case"],"expected_behaviors":["snake_case"],"success_outcomes":["snake_case"]}
Rules:
- required_tasks: concrete steps when applicable (qualify, collect contact, book, etc.)
- expected_behaviors: tone, compliance, objection handling per the prompt
- success_outcomes: valid ways to ACHIEVE the agent goal BESIDES a live booking when the prompt allows it — e.g. schedule_callback, escalate_to_human, tentative_hold, answer_blocking_questions_then_book, provide_ineligible_caller_next_steps
- 3-8 items per array where applicable; derive ONLY from the agent config`;
}

export function transcriptAnalyzerPrompt(agentConfig, criteria, transcript) {
  const goal = (agentConfig.goal ?? '').slice(0, 200);
  return `You are evaluating whether the VOICE AGENT (not the caller) achieved the agent's goal on this call.

Agent goal: ${goal}
Required tasks (when applicable): ${JSON.stringify(criteria.required_tasks ?? [])}
Expected behaviors: ${JSON.stringify(criteria.expected_behaviors ?? [])}
Valid success outcomes (goal can be met WITHOUT a confirmed booking): ${JSON.stringify(criteria.success_outcomes ?? [])}
Call: ${transcript.callId}

${formatTranscriptForLlm(transcript)}

Set goal_achieved TRUE if the agent met the agent goal, including ANY valid success outcome such as:
- Confirmed appointment/booking with specific date/time or service slot
- Caller deferred (spouse approval, schedule check): agent offered callback or tentative hold WITHOUT pressure — and caller accepted a clear next step
- Caller requested manager/escalation/billing help: agent transferred or committed to live handoff appropriately
- Caller asked blocking questions (pricing, policy): agent answered accurately per prompt/KB then progressed or booked
- Ineligible caller: agent explained why and gave a helpful alternative (not an abrupt hang-up)

Set goal_achieved FALSE if the agent failed the goal, e.g.:
- Rude, dismissive, or pressuring tone; scarcity tactics on objections
- Discussed booking but never confirmed; vague "someone will call you" with caller still unsure
- Collected only partial contact info and ended without booking or callback
- Unauthorized guarantees, wrong KB/policy answers, or compliance violations
- Caller needed escalation and agent kept pushing a new sale/booking instead
- Caller left with no resolution

task_completion: mark each required task true/false based on whether it was reasonably attempted/completed on this call.
objections: caller pushback only (price, timing, spouse, etc.). Use [] when none — never empty type strings.

JSON only: {"call_id":"${transcript.callId}","goal_achieved":bool,"task_completion":{},"objections":[{"type":"price","handled":bool}],"strengths":["max 3 short strings"],"failures":["max 5 short strings"]}
No prose. Short strings only.`;
}

/** Minimal per-call findings — no raw transcripts. */
export function compactAnalysesForPatterns(analyses) {
  return analyses.map((a) => ({
    id: a.call_id,
    ok: a.goal_achieved,
    fail: (a.failures ?? []).slice(0, 4),
    str: (a.strengths ?? []).slice(0, 2),
  }));
}

export function patternDetectionPrompt(analyses) {
  const compact = compactAnalysesForPatterns(analyses);
  return `${JSON.stringify(compact)}

JSON only: {"recurring_failures":[{"issue":"","frequency":0,"severity":"High|Medium|Low"}],"recurring_strengths":[{"issue":"","frequency":0}]}
Rules: max 6 failures, max 4 strengths; issue labels under 50 chars; frequency = call count; no affected_calls field.`;
}

export function testGeneratorPrompt(agentConfig, patterns) {
  const failures = (patterns?.recurring_failures ?? []).map((f) => ({
    issue: f.issue,
    frequency: f.frequency,
    severity: f.severity,
  }));
  return `Goal: ${(agentConfig.goal ?? '').slice(0, 200)}
Failures: ${JSON.stringify(failures)}

JSON only: {"testCases":[{"id":"","persona":"","scenario":"","failure_target":"","expected_behavior":["max 3 short items"],"success_criteria":["max 3 short items"]}]}
Rules: 3-4 tests from failures only; every test MUST include at least 2 success_criteria; keep each field under 12 words.`;
}

export function recommendationPrompt(agentConfig, patterns, testCases) {
  const aspects = deriveConfigAspects(agentConfig);
  const modifiablePaths = deriveModifiablePaths(agentConfig);
  const configJson = JSON.stringify(agentConfig);

  const aspectList = aspects.map((a, i) => `${i + 1}. ${a.label} (${a.key})`).join('\n');
  const pathList = modifiablePaths.map((p) => `- ${p}`).join('\n');

  return `Produce Evaluation tab JSON from call failures.

Aspects (${aspects.length} config_area_reviews):
${aspectList}

Checks:
${aspectReviewChecklist(aspects)}

SYNC: needs_change true → ≥1 modification on a path in that category. needs_change false → ZERO modifications for that category.

Modifiable paths (use exactly these path strings):
${pathList}

Rules:
- before MUST equal the current value at path in CURRENT_AGENT_CONFIG (copy exactly).
- after is the new value at that path (string or number for scalar paths).
- guardrails.escalationTriggers and guardrails.prohibitedClaims: after MUST be a JSON array string, e.g. ["item one","item two"]. Never plain comma-separated text.
- tools.*.description: include a modification when tool usage failures appear in FAILURES.
- knowledgeBase.*.answer: include a modification when KB retrieval or wrong-answer failures appear in FAILURES.
- One modification per path.
- issue/reason cite failure frequency and call IDs where possible.

CURRENT_AGENT_CONFIG:
${configJson}

FAILURES: ${JSON.stringify(patterns?.recurring_failures ?? [])}
TESTS: ${JSON.stringify(testCases?.testCases ?? testCases ?? [])}

JSON only: {"config_area_reviews":[{"area":"...","needs_change":true,"note":"..."}],"modifications":[{"id":"mod_1","path":"goal","before":"...","after":"...","priority":"High","issue":"...","reason":"...","expected_impact":"..."}]}
Categories for issue context: ${aspectCategoryEnum(aspects)} | exactly ${aspects.length} reviews | no placeholders`;
}
