/**
 * Flexible transcript JSON ingestion for upload endpoints.
 * Accepts many vendor/API shapes and normalizes each call to callId, turns,
 * outcome metadata, and summary fields used by the analysis pipeline.
 * Exports: parseFlexibleTranscriptJson.
 */

const WRAPPER_KEYS = [
  'transcripts',
  'calls',
  'conversations',
  'data',
  'results',
  'items',
  'records',
  'payload',
];

const TURN_KEYS = [
  'turns',
  'messages',
  'conversation',
  'dialogue',
  'utterances',
  'transcript',
  'history',
  'segments',
];

const AGENT_SPEAKERS = new Set([
  'agent',
  'assistant',
  'bot',
  'ai',
  'voice_ai',
  'voiceai',
  'system',
  'rep',
  'representative',
]);

const CALLER_SPEAKERS = new Set([
  'caller',
  'user',
  'customer',
  'human',
  'contact',
  'client',
  'lead',
  'caller_user',
]);

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function turnText(turn) {
  const raw =
    turn?.text ??
    turn?.message ??
    turn?.content ??
    turn?.utterance ??
    turn?.body ??
    turn?.transcript ??
    '';
  return typeof raw === 'string' ? raw.trim() : String(raw ?? '').trim();
}

function looksLikeTurn(turn) {
  return isPlainObject(turn) && turnText(turn).length > 0;
}

function looksLikeTurnArray(arr) {
  return Array.isArray(arr) && arr.length > 0 && arr.some(looksLikeTurn);
}

function looksLikeTranscript(obj) {
  if (!isPlainObject(obj)) return false;
  return TURN_KEYS.some((k) => looksLikeTurnArray(obj[k]));
}

function normalizeSpeaker(raw, index) {
  const s = String(raw ?? '').toLowerCase().trim();
  if (AGENT_SPEAKERS.has(s)) return 'agent';
  if (CALLER_SPEAKERS.has(s)) return 'caller';
  if (s === 'inbound' || s === 'incoming') return 'caller';
  if (s === 'outbound') return 'agent';
  // Alternate by index if speaker missing: even = agent, odd = caller
  if (!s) return index % 2 === 0 ? 'agent' : 'caller';
  // Unknown: guess caller unless it sounds like assistant
  if (s.includes('assist') || s.includes('agent')) return 'agent';
  return 'caller';
}

function normalizeTurn(turn, index) {
  const text = turnText(turn);
  if (!text) return null;

  const speaker = normalizeSpeaker(
    turn.speaker ?? turn.role ?? turn.from ?? turn.participant ?? turn.type,
    index
  );

  return {
    turnIndex: turn.turnIndex ?? turn.index ?? index,
    speaker,
    text,
    timestampOffsetSec: turn.timestampOffsetSec ?? turn.offset ?? turn.startTime ?? index * 5,
    interrupted: Boolean(turn.interrupted),
  };
}

function extractTurns(obj) {
  for (const key of TURN_KEYS) {
    if (looksLikeTurnArray(obj[key])) {
      return obj[key].map(normalizeTurn).filter(Boolean);
    }
  }
  return [];
}

function pickCallId(obj, index) {
  const id =
    obj.callId ??
    obj.call_id ??
    obj.id ??
    obj.conversationId ??
    obj.conversation_id ??
    obj.sessionId ??
    obj.session_id;
  if (id != null && String(id).trim()) return String(id).trim();
  return `upload_${index + 1}_${Date.now().toString(36)}`;
}

export function normalizeRawTranscript(raw, index = 0) {
  // Bare array of turns → single call
  if (Array.isArray(raw) && raw.every((t) => looksLikeTurn(t) || isPlainObject(t))) {
    const turns = raw.map(normalizeTurn).filter(Boolean);
    if (!turns.length) {
      throw new Error('No dialogue turns found in array');
    }
    return buildTranscript({ turns }, index);
  }

  if (!isPlainObject(raw)) {
    throw new Error(`Item #${index + 1}: expected a JSON object or array of turns`);
  }

  const turns = extractTurns(raw);
  if (!turns.length) {
    throw new Error(
      `Item #${index + 1}: no turns found (looked for ${TURN_KEYS.join(', ')})`
    );
  }

  return buildTranscript(raw, index, turns);
}

function buildTranscript(raw, index, turns = extractTurns(raw)) {
  const callId = pickCallId(raw, index);

  return {
    callId,
    agentId: raw.agentId?.trim?.() || raw.agent_id?.trim?.() || 'uploaded_agent',
    locationId: raw.locationId?.trim?.() || raw.location_id?.trim?.() || 'uploaded_location',
    contactId: raw.contactId ?? raw.contact_id ?? null,
    startedAt: raw.startedAt ?? raw.started_at ?? raw.createdAt ?? raw.created_at ?? new Date().toISOString(),
    endedAt: raw.endedAt ?? raw.ended_at ?? raw.startedAt ?? raw.started_at ?? new Date().toISOString(),
    durationSeconds: raw.durationSeconds ?? raw.duration_seconds ?? raw.duration ?? turns.length * 8,
    outcome: raw.outcome ?? raw.status ?? raw.result ?? 'unknown',
    callerPhone: raw.callerPhone ?? raw.caller_phone ?? raw.phone ?? '',
    summary:
      raw.summary?.trim?.() ||
      raw.description?.trim?.() ||
      raw.notes?.trim?.() ||
      `Uploaded call ${callId}`,
    tags: Array.isArray(raw.tags) ? raw.tags : ['uploaded'],
    toolsUsed: Array.isArray(raw.toolsUsed) ? raw.toolsUsed : raw.tools_used ?? [],
    turns,
    expectedIssues: raw.expectedIssues,
    _meta: { scenario: 'uploaded', source: 'upload' },
  };
}

function collectCandidates(data, out = []) {
  if (data == null) return out;

  if (Array.isArray(data)) {
    // Array of turns only
    if (data.every((t) => looksLikeTurn(t) || (isPlainObject(t) && turnText(t)))) {
      out.push(data);
      return out;
    }
    // Array of transcripts or mixed roots
    for (const item of data) {
      collectCandidates(item, out);
    }
    return out;
  }

  if (!isPlainObject(data)) return out;

  if (looksLikeTranscript(data)) {
    out.push(data);
    return out;
  }

  for (const key of WRAPPER_KEYS) {
    if (data[key] != null) {
      collectCandidates(data[key], out);
    }
  }

  // Single-key wrapper: { "call_001": { turns: [...] } }
  const values = Object.values(data);
  if (
    values.length === 1 &&
    (looksLikeTranscript(values[0]) || Array.isArray(values[0]))
  ) {
    collectCandidates(values[0], out);
    return out;
  }

  // Last resort: shallow search one level deep
  if (!out.length) {
    for (const value of values) {
      if (looksLikeTranscript(value) || (Array.isArray(value) && value.some(looksLikeTurn))) {
        collectCandidates(value, out);
      }
    }
  }

  return out;
}

/** Parse any JSON value into normalized transcript objects. */
export function parseFlexibleTranscriptJson(body) {
  // Frontend upload wrapper
  const root = body?.data !== undefined ? body.data : body;

  if (root?.transcripts && Array.isArray(root.transcripts)) {
    return root.transcripts.map((t, i) => normalizeRawTranscript(t, i));
  }

  const candidates = collectCandidates(root);

  if (!candidates.length) {
    throw new Error(
      'Could not find call transcripts in JSON. Include a turns/messages array with speaker + text fields.'
    );
  }

  return candidates.map((c, i) => normalizeRawTranscript(c, i));
}
