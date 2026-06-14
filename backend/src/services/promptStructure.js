/**
 * Post-processes optimized agent prompts into a consistent section layout.
 * Unescapes pasted newlines, isolates known headers, and normalizes lists for
 * the Evaluation tab "Optimized prompt" output after modifications are applied.
 * Exports: unescapePromptText, structurePrompt.
 */

const SECTION_HEADERS = [
  'PRIMARY GOAL',
  'CONVERSATION FLOW',
  'OBJECTION HANDLING',
  'TONE',
  'BOUNDARIES',
  'TOOLS',
  'ESCALATION UPDATE',
  'KNOWLEDGE BASE UPDATE',
  'MODEL UPDATE',
  '--- CALL SCRIPT / FLOW ---',
];

const HEADER_PATTERN = SECTION_HEADERS.map((h) =>
  h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
).join('|');

/** Turn literal "\\n" from pasted JSON/UI into real newlines. */
export function unescapePromptText(text) {
  return String(text ?? '')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\r\n/g, '\n')
    .trim();
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Ensure each known section header starts on its own line with a blank line before it. */
function isolateSectionHeaders(text) {
  let out = text;
  for (const header of SECTION_HEADERS) {
    const h = escapeRegExp(header);
    out = out.replace(new RegExp(`([^\\n])\\s*(${h})\\s*(?=\\n|$)`, 'gi'), '$1\n\n$2');
    out = out.replace(new RegExp(`^(${h})([^\\n])`, 'gim'), '$1\n$2');
  }
  return out;
}

/** Put bullets and numbered steps on their own lines. */
function normalizeListItems(text) {
  return text
    .replace(/([^\n])\s+(- )/g, '$1\n$2')
    .replace(/([^\n])\s+(\d+\.\s+)/g, '$1\n$2');
}

/** Collapse extra blank lines; trim trailing spaces per line. */
function tidyWhitespace(text) {
  return text
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Rebuild prompt: intro paragraph, then each section as HEADER + body.
 */
function rebuildSections(text) {
  const headerRe = new RegExp(`(${HEADER_PATTERN})`, 'gi');
  const chunks = text.split(headerRe).map((c) => c.trim()).filter(Boolean);
  if (chunks.length <= 1) return text;

  const parts = [];
  let i = 0;
  while (i < chunks.length) {
    const chunk = chunks[i];
    const isHeader = SECTION_HEADERS.some((h) => h.toLowerCase() === chunk.toLowerCase());
    if (!isHeader) {
      parts.push(chunk);
      i += 1;
      continue;
    }
    const body = chunks[i + 1] ?? '';
    const bodyLines = body
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const formattedBody = bodyLines.join('\n');
    parts.push(formattedBody ? `${chunk.toUpperCase()}\n${formattedBody}` : chunk.toUpperCase());
    i += 2;
  }
  return parts.join('\n\n');
}

/**
 * Produce a copy-paste-ready structured prompt (sections, bullets, real newlines).
 */
export function structurePrompt(raw) {
  if (!raw?.trim()) return '';

  let text = unescapePromptText(raw);
  text = isolateSectionHeaders(text);
  text = normalizeListItems(text);
  text = tidyWhitespace(text);
  text = rebuildSections(text);
  return tidyWhitespace(text);
}
