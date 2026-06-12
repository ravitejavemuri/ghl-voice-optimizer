import { formatTranscriptForLlm } from './transcriptTrim.js';

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

Return JSON only: {"required_tasks":["snake_case"],"expected_behaviors":["snake_case"]}
Rules: 3-8 each; derive from input only.`;
}

export function transcriptAnalyzerPrompt(agentConfig, criteria, transcript) {
  const goal = (agentConfig.goal ?? '').slice(0, 200);
  return `Goal: ${goal}
Tasks: ${JSON.stringify(criteria.required_tasks ?? [])}
Behaviors: ${JSON.stringify(criteria.expected_behaviors ?? [])}
Call: ${transcript.callId}

${formatTranscriptForLlm(transcript)}

JSON only: {"call_id":"${transcript.callId}","goal_achieved":bool,"task_completion":{},"objections":[{"type":"price","handled":bool}],"strengths":["max 3 short strings"],"failures":["max 5 short strings"]}
Rules: objections = caller pushback only (price, timing, spouse, etc.). Use [] when no objection occurred — never use empty type strings.
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
  const agentPrompt = agentConfig.prompt ?? '';
  return `Recommend Voice AI agent improvements from recurring call failures.

AGENT_PROMPT (copy "before" excerpts verbatim from here):
"""
${agentPrompt.slice(0, 2500)}
"""

AGENT_GOAL: ${(agentConfig.goal ?? '').slice(0, 400)}
MODEL: ${agentConfig.model ?? ''}  TEMPERATURE: ${agentConfig.temperature ?? ''}
TOOLS: ${JSON.stringify(agentConfig.tools?.map((tool) => tool.id) ?? [])}

RECURRING_FAILURES:
${JSON.stringify(patterns?.recurring_failures ?? [], null, 2)}

GENERATED_TESTS:
${JSON.stringify(testCases?.testCases ?? testCases ?? [], null, 2)}

Return JSON only:
{
  "recommendations": [{
    "id": "rec_1",
    "priority": "High" | "Medium" | "Low",
    "category": "Prompt" | "Temperature" | "Tools" | "Knowledge Base" | "Escalation",
    "issue": "short failure label",
    "before": "exact verbatim excerpt from AGENT_PROMPT",
    "after": "full replacement text for that excerpt",
    "reason": "cite frequency and affected call IDs",
    "expected_impact": "specific improvement expected"
  }]
}

Rules:
- 3-6 recommendations, each tied to one recurring failure.
- "before" MUST be copied verbatim from AGENT_PROMPT (a real paragraph or bullet block).
- NEVER use placeholders like "Current agent instructions" or "Add explicit instruction to prevent...".
- "after" MUST be the rewritten replacement for "before", not a meta-instruction about what to add.
- For Temperature: before = current temperature string, after = suggested temperature string.
- reason must cite call count and IDs when available.`;
}
