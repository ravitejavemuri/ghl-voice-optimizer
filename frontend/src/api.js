const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  health: () => request('/health'),
  agent: () => request('/agent'),
  agentMeta: () => request('/agent/meta'),
  saveAgent: (data) =>
    request('/agent', { method: 'POST', body: JSON.stringify({ data }) }),
  saveAgentFields: (fields) =>
    request('/agent', { method: 'POST', body: JSON.stringify(fields) }),
  useSampleAgent: () => request('/agent/use-sample', { method: 'POST' }),
  useGenericAgent: () => request('/agent/use-generic', { method: 'POST' }),
  transcriptMeta: () => request('/transcripts/meta'),
  transcripts: () => request('/transcripts'),
  transcript: (callId) => request(`/transcripts/${callId}`),
  uploadTranscripts: ({ data, fileNames = [], append = false }) =>
    request('/transcripts/upload', {
      method: 'POST',
      body: JSON.stringify({ data, fileNames, append }),
    }),
  clearTranscripts: () => request('/transcripts/clear', { method: 'POST' }),
  useSampleTranscripts: () => request('/transcripts/use-samples', { method: 'POST' }),
  state: () => request('/state'),
  pipelineProgress: () => request('/pipeline/progress'),
  reset: () => request('/reset', { method: 'POST' }),
  runFull: () => request('/run/full', { method: 'POST' }),
};
