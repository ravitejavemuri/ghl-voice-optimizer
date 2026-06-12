const MAX_TRANSCRIPT_CHARS = 3000;

const FILLER_PATTERN =
  /^(okay|ok|sure|uh[\s-]?huh|i see|got it|thank you|thanks|mm[\s-]?hmm|mhm|right|yes|yeah|yep|alright|hello|hi|one moment|hold on)[.!?,]*$/i;

export function isFillerTurn(text) {
  const t = String(text ?? '').trim();
  if (!t) return true;
  if (t.length <= 3) return true;
  return FILLER_PATTERN.test(t);
}

/** Drop filler turns; cap length. Only used at transcript-analysis stage. */
export function formatTranscriptForLlm(transcript) {
  const turns = (transcript.turns ?? []).filter((t) => !isFillerTurn(t.text));
  let text = turns.map((t) => `${t.speaker}: ${t.text}`).join('\n');
  if (text.length > MAX_TRANSCRIPT_CHARS) {
    text = `${text.slice(0, MAX_TRANSCRIPT_CHARS)}\n…[truncated]`;
  }
  return text;
}
