const GENERIC_SNIPPET = [
  /^current agent instructions?\.?$/i,
  /^add explicit instruction to prevent:/i,
  /^n\/?a$/i,
];

const MIN_ISSUE_SCORE = 2;

function normalizeNewlines(text) {
  return (text ?? '').replace(/\r\n/g, '\n').trim();
}

export function isGenericSnippet(text) {
  const trimmed = normalizeNewlines(text);
  if (!trimmed || trimmed.length < 15) return true;
  return GENERIC_SNIPPET.some((pattern) => pattern.test(trimmed));
}

function excerptInPrompt(prompt, excerpt) {
  const normalizedPrompt = normalizeNewlines(prompt);
  const normalizedExcerpt = normalizeNewlines(excerpt);
  return normalizedPrompt.includes(normalizedExcerpt);
}

function splitPromptSections(prompt) {
  return normalizeNewlines(prompt)
    .split(/\n\n+/)
    .map((section) => section.trim())
    .filter(Boolean);
}

function scoreSection(section, issue) {
  const lower = section.toLowerCase();
  const issueLower = issue.toLowerCase();
  let score = 0;

  const tokens = issueLower.match(/\b[a-z]{4,}\b/g) ?? [];
  score += tokens.filter((token) => lower.includes(token)).length;

  const topicPairs = [
    [/service area|verification|qualif/i, /service area|homeowner|qualif|denver/i],
    [/book|appointment|schedul/i, /book|appointment|schedul|slot/i],
    [/escalat|manager|human|transfer/i, /escalat|manager|human|transfer|angry/i],
    [/objection|pressure|spouse/i, /objection|pressure|callback|think/i],
    [/warranty|guarantee|rebate|kb/i, /warranty|guarantee|rebate|knowledge|boundar/i],
    [/follow.?up|recap|close/i, /recap|next step|close|callback/i],
    [/tool|check_service/i, /tool|check_service|book_appointment/i],
    [/contact|collect|phone|email|address/i, /collect|name|phone|email|address|contact/i],
  ];

  for (const [issuePattern, sectionPattern] of topicPairs) {
    if (issuePattern.test(issueLower) && sectionPattern.test(lower)) {
      score += 4;
    }
  }

  return score;
}

export function findBestPromptSection(prompt, issue) {
  const sections = splitPromptSections(prompt);
  let best = null;
  let bestScore = 0;

  for (const section of sections) {
    const score = scoreSection(section, issue);
    if (score > bestScore) {
      bestScore = score;
      best = section;
    }
  }

  return bestScore > 0 ? best : null;
}

const SECTION_HEADER = /^[A-Z][A-Z0-9 \-/&']+$/;

function sectionHeader(text) {
  const first = normalizeNewlines(text).split('\n')[0]?.trim() ?? '';
  return SECTION_HEADER.test(first) ? first : null;
}

/** Best verbatim line (or full section) from the prompt for an issue. */
function findBestPromptExcerpt(prompt, issue) {
  const section = findBestPromptSection(prompt, issue);
  if (!section) return null;

  const lines = section.split('\n').map((line) => line.trim()).filter(Boolean);
  const contentLines = lines.filter((line) => !SECTION_HEADER.test(line));

  let bestLine = null;
  let bestScore = 0;
  for (const line of contentLines) {
    const score = scoreSection(line, issue);
    if (score > bestScore && excerptInPrompt(prompt, line)) {
      bestScore = score;
      bestLine = line;
    }
  }

  if (bestLine && bestScore > 0) return bestLine;
  if (excerptInPrompt(prompt, section)) return section;
  return null;
}

/** Shrink to a substring that exists contiguously in the agent prompt. */
function ensureVerbatimExcerpt(prompt, excerpt) {
  const normalized = normalizeNewlines(excerpt);
  if (excerptInPrompt(prompt, normalized)) return normalized;

  const lines = normalized.split('\n').map((line) => line.trim()).filter(Boolean);
  const contentLines = lines.filter((line) => !SECTION_HEADER.test(line));
  contentLines.sort((a, b) => b.length - a.length);

  for (const line of contentLines) {
    if (line.length >= 15 && excerptInPrompt(prompt, line)) return line;
  }

  const header = sectionHeader(normalized);
  if (header) {
    const section = splitPromptSections(prompt).find((part) => sectionHeader(part) === header);
    if (section && excerptInPrompt(prompt, section)) return section;
  }

  return normalized;
}

/** When before is a single line, after should replace that line — not a whole section block. */
function alignAfterToBefore(before, after) {
  const normalizedBefore = normalizeNewlines(before);
  const normalizedAfter = normalizeNewlines(after);
  if (normalizedBefore.includes('\n') || normalizedAfter.startsWith(normalizedBefore)) {
    return after;
  }

  const lines = normalizedAfter
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !SECTION_HEADER.test(line));

  if (!lines.length) return after;

  const rewritten = lines.find((line) => line.startsWith('-') || /^\d+\./.test(line));
  return rewritten ?? lines[lines.length - 1];
}

/** True when LLM paired an excerpt from one prompt block with a rewrite of another. */
export function beforeAfterMismatch(before, after) {
  const headerBefore = sectionHeader(before);
  const headerAfter = sectionHeader(after);
  return Boolean(headerBefore && headerAfter && headerBefore !== headerAfter);
}

function beforeMatchesIssue(before, issue) {
  if (!issue) return true;
  return scoreSection(before, issue) >= MIN_ISSUE_SCORE;
}

/** Find the prompt excerpt that `after` is actually rewriting. */
function findPromptExcerptForAfter(prompt, after) {
  const normalized = normalizeNewlines(after);
  if (excerptInPrompt(prompt, normalized)) return normalized;

  const lines = normalized.split('\n').map((line) => line.trim()).filter(Boolean);
  const header = sectionHeader(normalized);
  const bodyLines = header ? lines.slice(1) : lines;
  const promptLines = normalizeNewlines(prompt).split('\n').map((line) => line.trim()).filter(Boolean);
  const promptLineSet = new Set(promptLines);

  const sorted = [...bodyLines].sort((a, b) => b.length - a.length);
  for (const line of sorted) {
    if (line.length >= 15 && promptLineSet.has(line)) return line;
    const fuzzy = promptLines.find(
      (promptLine) =>
        (line.length >= 20 &&
          promptLine.includes(line.slice(0, Math.min(40, line.length)))) ||
        (promptLine.length >= 20 &&
          line.includes(promptLine.slice(0, Math.min(40, promptLine.length))))
    );
    if (fuzzy) return fuzzy;
  }

  if (header) {
    const section = splitPromptSections(prompt).find((part) => sectionHeader(part) === header);
    if (section) return section;
  }

  return null;
}

function realignMismatchedPair(agentPrompt, before, after) {
  if (!beforeAfterMismatch(before, after)) {
    return { before, after };
  }

  const anchoredBefore = findPromptExcerptForAfter(agentPrompt, after);
  if (anchoredBefore && excerptInPrompt(agentPrompt, anchoredBefore)) {
    return { before: anchoredBefore, after };
  }

  return { before, after };
}

function buildPromptAfter(before, issue) {
  const issueLower = issue.toLowerCase();
  const additions = [];

  if (/service area|verification|qualif|homeowner/i.test(issueLower)) {
    additions.push(
      '- REQUIRED: Confirm homeowner status AND service area before collecting contact details or offering times.'
    );
    additions.push('- ALWAYS call check_service_area when a city or ZIP is mentioned.');
  }
  if (/book|appointment|incomplete|schedul/i.test(issueLower)) {
    additions.push(
      '- REQUIRED: Call book_appointment only after all fields are collected, then verbally confirm date, time, and address.'
    );
  }
  if (/escalat|manager|human|transfer/i.test(issueLower)) {
    additions.push(
      '- REQUIRED: On first request for a manager or human, offer transfer_to_human immediately — do not continue booking.'
    );
  }
  if (/objection|pressure|spouse|callback/i.test(issueLower)) {
    additions.push(
      '- REQUIRED: Acknowledge without pressure; offer create_callback_task or a tentative hold — never use scarcity language.'
    );
  }
  if (/warranty|guarantee|rebate|kb|policy/i.test(issueLower)) {
    additions.push('- REQUIRED: Answer only from the knowledge base; never invent warranty or savings guarantees.');
  }
  if (/follow.?up|recap|close/i.test(issueLower)) {
    additions.push('- REQUIRED: Recap appointment details and next steps, or create_callback_task before ending the call.');
  }
  if (/contact|collect|phone|email|address/i.test(issueLower)) {
    additions.push(
      '- REQUIRED: Collect full name, phone number, email, and service address before offering appointment times.'
    );
  }

  if (!additions.length) {
    additions.push(`- REQUIRED: Address "${issue}" before moving to the next conversation step.`);
  }

  return `${before.trim()}\n${additions.join('\n')}`;
}

function normalizePromptRecommendation(rec, agentPrompt) {
  let before = rec.before ?? '';
  let after = rec.after ?? '';
  const issue = rec.issue ?? '';

  if (isGenericSnippet(before) || !excerptInPrompt(agentPrompt, before)) {
    const excerpt = findBestPromptExcerpt(agentPrompt, issue);
    if (excerpt) {
      before = excerpt;
    }
  }

  if (isGenericSnippet(before) || !excerptInPrompt(agentPrompt, before)) {
    return null;
  }

  // LLM often reuses the same snippet for every failure — re-anchor to the issue topic.
  if (!beforeMatchesIssue(before, issue)) {
    const excerpt = findBestPromptExcerpt(agentPrompt, issue);
    if (excerpt && scoreSection(excerpt, issue) > scoreSection(before, issue)) {
      before = excerpt;
      after = buildPromptAfter(before, issue);
    }
  }

  if (beforeAfterMismatch(before, after)) {
    ({ before, after } = realignMismatchedPair(agentPrompt, before, after));
  }

  if (isGenericSnippet(after) || after.includes('Add explicit instruction to prevent')) {
    after = buildPromptAfter(before, issue);
  }

  after = stripRedundantAfterHeader(before, after);
  after = alignAfterToBefore(before, after);

  before = ensureVerbatimExcerpt(agentPrompt, before);
  if (!excerptInPrompt(agentPrompt, before)) {
    return null;
  }

  return { ...rec, before, after };
}

function stripRedundantAfterHeader(before, after) {
  const headerAfter = sectionHeader(after);
  if (!headerAfter || sectionHeader(before) === headerAfter) {
    return after;
  }

  const lines = normalizeNewlines(after).split('\n');
  if (lines[0]?.trim() === headerAfter) {
    return lines.slice(1).join('\n').trim();
  }

  return after;
}

function normalizeTemperatureRecommendation(rec, agentConfig) {
  const before = isGenericSnippet(rec.before)
    ? String(agentConfig.temperature ?? '0.7')
    : rec.before;
  const after = rec.after ?? '';

  if (!after || Number.isNaN(parseFloat(after))) {
    return null;
  }

  return { ...rec, before, after };
}

function dedupeRecommendations(recommendations) {
  const seen = new Set();
  const deduped = [];

  for (const rec of recommendations) {
    const key = `${rec.before}::${rec.after}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(rec);
  }

  return deduped;
}

export function normalizeRecommendations(recommendations, agentConfig) {
  const agentPrompt = agentConfig.prompt ?? '';
  const normalized = [];

  for (const rec of recommendations) {
    const category = (rec.category ?? 'Prompt').toLowerCase();
    let item = rec;

    if (category === 'prompt' || category === 'guardrails' || category === 'escalation') {
      item = normalizePromptRecommendation(rec, agentPrompt);
    } else if (category === 'temperature') {
      item = normalizeTemperatureRecommendation(rec, agentConfig);
    } else if (category === 'tools' || category === 'knowledge base' || category === 'model') {
      if (isGenericSnippet(rec.before)) {
        const section = findBestPromptSection(agentPrompt, rec.issue ?? '');
        item = section
          ? {
              ...rec,
              before: section,
              after: isGenericSnippet(rec.after)
                ? buildPromptAfter(section, rec.issue ?? '')
                : rec.after,
            }
          : null;
      }
    }

    if (item?.before && item?.after) {
      normalized.push(item);
    }
  }

  return dedupeRecommendations(normalized);
}
