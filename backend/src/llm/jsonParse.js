/**
 * Robust JSON parsing for LLM structured-output responses.
 * Strips thinking tags, extracts fenced or bare objects, and repairs truncated
 * JSON when models hit token limits mid-response.
 * Exports: parseJsonResponse, repairTruncatedJson, stripThinking.
 */
export function stripThinking(text) {
  return text.replace(/[\s\S]*?<\/think>\s*/gi, '').trim();
}

function closeJson(s) {
  const stack = [];
  let inString = false;
  let escaped = false;

  for (const ch of s) {
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if (ch === '}' || ch === ']') stack.pop();
  }

  let out = s.replace(/,\s*$/s, '');
  if (inString) out += '"';
  while (stack.length) out += stack.pop();
  return out;
}

function tryParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/** Close truncated arrays/objects so partial model output can still parse. */
export function repairTruncatedJson(text) {
  let s = stripThinking(text).trim();
  const start = s.indexOf('{');
  if (start < 0) throw new Error('No JSON object found');
  s = s.slice(start);

  for (let attempt = 0; attempt < 40; attempt++) {
    let candidate = s
      .replace(/,\s*"[^"]*$/s, '')
      .replace(/:\s*"[^"]*$/s, ': ""');

    if ((candidate.match(/(?<!\\)"/g) || []).length % 2 === 1) {
      candidate = candidate.replace(/"[^"]*$/s, '""');
    }

    candidate = closeJson(candidate);
    const parsed = tryParse(candidate);
    if (parsed) return parsed;

    const lastComma = s.lastIndexOf(',');
    if (lastComma < 0) break;
    s = s.slice(0, lastComma);
  }

  throw new Error('Could not repair truncated JSON');
}

export function parseJsonResponse(text) {
  const cleaned = stripThinking(text).trim();

  const direct = tryParse(cleaned);
  if (direct) return direct;

  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    const inner = tryParse(fenced[1].trim());
    if (inner) return inner;
  }

  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) {
    const slice = tryParse(cleaned.slice(start, end + 1));
    if (slice) return slice;
  }

  return repairTruncatedJson(cleaned);
}
