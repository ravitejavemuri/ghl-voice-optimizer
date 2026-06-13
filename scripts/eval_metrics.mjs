/**
 * Standard optimizer evaluation metrics (analysis accuracy vs human-labeled manifest).
 * Aligns with Modifications.md Optimizer Evaluation Framework.
 */

export const ISSUE_KEYWORDS = {
  poor_objection_handling: ['objection', 'pressure', 'pushy', 'spouse', 'partner', 'urgency', 'scarcity', 'hesitat'],
  missed_escalation: ['escalat', 'manager', 'supervisor', 'transfer', 'human', 'billing dispute', 'complaint'],
  incorrect_tone: ['tone', 'rude', 'dismiss', 'curt', 'unprofessional', 'pushy', 'busy'],
  incomplete_booking_flow: ['booking', 'appointment', 'schedule', 'incomplete', 'confirm', 'book', 'slot', 'not booked'],
  lost_flow_after_interruption: ['interrupt', 'flow', 'pricing', 'cost', 'copay', 'question', 'distract', 'answer'],
  incomplete_contact_collection: ['contact', 'email', 'address', 'phone', 'partial', 'missing', 'last name', 'vin'],
  policy_violation: ['policy', 'guarantee', 'unauthorized', 'compliance', 'prohibited', 'zero cost', 'money-back'],
  unsupported_claim: ['guarantee', 'warranty', 'claim', 'unsupported', 'lifetime', 'inaccurate', 'contradict'],
  kb_inaccuracy: ['knowledge', 'website', 'warranty', 'inaccurate', 'incorrect', 'policy', 'loaner', 'insurance'],
  weak_follow_up: ['follow', 'next step', 'callback', 'close', 'recap', 'abrupt', 'referral', 'bye', 'no step'],
  missed_qualification: ['qualif', 'homeowner', 'service area', 'renter', 'ineligible', 'new patient', 'fleet', 'commercial'],
};

function norm(s) {
  return String(s ?? '').toLowerCase();
}

export function inferIssuesFromText(texts) {
  const blob = norm(texts.join(' '));
  const found = new Set();
  for (const [issue, keywords] of Object.entries(ISSUE_KEYWORDS)) {
    if (keywords.some((kw) => blob.includes(kw))) found.add(issue);
  }
  return [...found];
}

export function predictedIssuesForAnalysis(analysis) {
  const failures = analysis.failures ?? [];
  const fromFailures = inferIssuesFromText(failures);
  if (fromFailures.length) return fromFailures;
  if (!analysis.goal_achieved) return ['incomplete_booking_flow'];
  return [];
}

export function prf1(tp, fp, fn) {
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  return { precision, recall, f1, tp, fp, fn };
}

export function outcomeLabelFromManifest(entry) {
  return entry.outcome === 'success';
}

export function outcomeFromAnalysis(analysis) {
  return Boolean(analysis.goal_achieved);
}

export function scoreOutcomeClassification(entries, analysesById) {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  const perCall = [];

  for (const entry of entries) {
    const analysis = analysesById.get(entry.callId);
    if (!analysis) continue;
    const expectedFail = !outcomeLabelFromManifest(entry);
    const predictedFail = !outcomeFromAnalysis(analysis);
    const correct = expectedFail === predictedFail;
    if (expectedFail && predictedFail) tp++;
    else if (!expectedFail && predictedFail) fp++;
    else if (expectedFail && !predictedFail) fn++;
    else tn++;
    perCall.push({
      callId: entry.callId,
      expected: entry.outcome,
      predicted: analysis.goal_achieved ? 'success' : 'failure',
      correct,
    });
  }

  const n = perCall.length;
  const accuracy = n ? (tp + tn) / n : 0;
  const failureClass = prf1(tp, fp, fn);
  return {
    accuracy,
    confusion: { tp, fp, fn, tn },
    precision_failure: failureClass.precision,
    recall_failure: failureClass.recall,
    f1_failure: failureClass.f1,
    perCall,
  };
}

export function scoreIssueDetection(entries, analysesById, issueCatalog) {
  let microTp = 0;
  let microFp = 0;
  let microFn = 0;
  const perIssue = Object.fromEntries(issueCatalog.map((i) => [i, { tp: 0, fp: 0, fn: 0 }]));
  const perCall = [];
  let top1Hits = 0;
  let top1Total = 0;

  for (const entry of entries) {
    const analysis = analysesById.get(entry.callId);
    if (!analysis) continue;
    const expected = new Set(
      (entry.expectedIssues ?? []).filter((i) => i !== 'none')
    );
    const predicted = new Set(predictedIssuesForAnalysis(analysis));

    for (const issue of issueCatalog) {
      const e = expected.has(issue);
      const p = predicted.has(issue);
      if (e && p) {
        microTp++;
        perIssue[issue].tp++;
      } else if (!e && p) {
        microFp++;
        perIssue[issue].fp++;
      } else if (e && !p) {
        microFn++;
        perIssue[issue].fn++;
      }
    }

    if (expected.size) {
      top1Total++;
      const primary = [...expected][0];
      const topPred = [...predicted][0];
      if (topPred && (predicted.has(primary) || inferIssuesFromText([analysis.failures?.[0] ?? '']).includes(primary))) {
        top1Hits++;
      }
    }

    perCall.push({
      callId: entry.callId,
      expected: [...expected],
      predicted: [...predicted],
      failures: analysis.failures ?? [],
    });
  }

  const micro = prf1(microTp, microFp, microFn);
  const macroScores = issueCatalog
    .map((issue) => prf1(perIssue[issue].tp, perIssue[issue].fp, perIssue[issue].fn))
    .filter((s) => s.tp + s.fp + s.fn > 0);
  const macroF1 = macroScores.length
    ? macroScores.reduce((a, s) => a + s.f1, 0) / macroScores.length
    : 0;

  return {
    micro_precision: micro.precision,
    micro_recall: micro.recall,
    micro_f1: micro.f1,
    macro_f1: macroF1,
    top1_agreement: top1Total ? top1Hits / top1Total : 0,
    perIssue: Object.fromEntries(
      issueCatalog.map((issue) => {
        const s = prf1(perIssue[issue].tp, perIssue[issue].fp, perIssue[issue].fn);
        return [issue, { ...s, support: perIssue[issue].tp + perIssue[issue].fn }];
      })
    ),
    perCall,
  };
}

function fuzzyMatchIssue(patternText, catalogIssue) {
  const p = norm(patternText);
  const keywords = ISSUE_KEYWORDS[catalogIssue] ?? [catalogIssue.replace(/_/g, ' ')];
  return keywords.some((kw) => p.includes(kw)) || p.includes(catalogIssue.replace(/_/g, ' '));
}

export function scorePatternDetection(entries, patterns, issueCatalog) {
  const expectedIssues = new Set();
  for (const e of entries) {
    for (const i of e.expectedIssues ?? []) {
      if (i !== 'none') expectedIssues.add(i);
    }
  }
  const recurring = patterns?.recurring_failures ?? [];
  const detected = new Set();
  for (const row of recurring) {
    for (const issue of issueCatalog) {
      if (fuzzyMatchIssue(row.issue ?? '', issue)) detected.add(issue);
    }
  }
  let hits = 0;
  for (const issue of expectedIssues) {
    if (detected.has(issue)) hits++;
  }
  return {
    pattern_recall: expectedIssues.size ? hits / expectedIssues.size : 0,
    expected_count: expectedIssues.size,
    detected_count: detected.size,
    matched: hits,
    recurring_labels: recurring.map((r) => r.issue),
  };
}

export function scoreTestCoverage(entries, testCases) {
  const expectedIssues = new Set();
  for (const e of entries) {
    for (const i of e.expectedIssues ?? []) {
      if (i !== 'none') expectedIssues.add(i);
    }
  }
  const cases = testCases?.testCases ?? [];
  const covered = new Set();
  for (const tc of cases) {
    const blob = norm(
      [tc.failure_target, tc.scenario, ...(tc.expected_behavior ?? []), ...(tc.success_criteria ?? [])].join(' ')
    );
    for (const issue of expectedIssues) {
      const keywords = ISSUE_KEYWORDS[issue] ?? [issue.replace(/_/g, ' ')];
      if (keywords.some((kw) => blob.includes(kw)) || blob.includes(issue.replace(/_/g, ' '))) {
        covered.add(issue);
      }
    }
  }
  return {
    test_coverage: expectedIssues.size ? covered.size / expectedIssues.size : 0,
    covered: [...covered],
    expected: [...expectedIssues],
    test_case_count: cases.length,
  };
}

/**
 * Agent-agnostic metrics — valid across dental, auto, housekeeping, etc.
 * Each agent has different goals; we judge whether the optimizer read the call correctly,
 * not whether failures map to a shared issue taxonomy.
 */
export function scoreFailureAwareness(entries, analysesById) {
  const failureCalls = entries.filter((e) => e.outcome === 'failure');
  const successCalls = entries.filter((e) => e.outcome === 'success');
  let failureFlagged = 0;
  let failureExplained = 0;
  let successRecognized = 0;

  for (const entry of failureCalls) {
    const a = analysesById.get(entry.callId);
    if (!a) continue;
    if (!a.goal_achieved) failureFlagged++;
    if ((a.failures ?? []).length > 0) failureExplained++;
  }
  for (const entry of successCalls) {
    const a = analysesById.get(entry.callId);
    if (a?.goal_achieved) successRecognized++;
  }

  return {
    failure_flag_rate: failureCalls.length ? failureFlagged / failureCalls.length : 0,
    failure_explained_rate: failureCalls.length ? failureExplained / failureCalls.length : 0,
    success_recognition_rate: successCalls.length ? successRecognized / successCalls.length : 0,
    failure_calls: failureCalls.length,
    success_calls: successCalls.length,
  };
}

export function scoreSuite({ entries, analyses, patterns, testCases, issueCatalog }) {
  const analysesById = new Map(
    analyses.map((a) => [a.call_id ?? a.callId, a])
  );
  return {
    outcome_classification: scoreOutcomeClassification(entries, analysesById),
    failure_awareness: scoreFailureAwareness(entries, analysesById),
    /** Advisory only — suite-local slug match; not a cross-agent pass/fail metric. */
    suite_local_issue_regression: scoreIssueDetection(entries, analysesById, issueCatalog),
    pattern_detection: scorePatternDetection(entries, patterns, issueCatalog),
    test_coverage: scoreTestCoverage(entries, testCases),
    calls_evaluated: analyses.length,
  };
}
