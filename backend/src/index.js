import 'dotenv/config';
import fs from 'fs';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  getActiveAgentConfig,
  getAgentMeta,
  setAgentConfig,
  useSampleAgentConfig,
  useGenericAgentConfig,
  parseAgentPayload,
} from './agentRegistry.js';
import {
  getActiveTranscripts,
  getTranscriptMeta,
  listTranscriptSummaries,
  getPublicTranscript,
  parseTranscriptPayload,
  setUploadedTranscripts,
  appendUploadedTranscripts,
  clearTranscripts,
} from './transcriptRegistry.js';
import { resolveProvider } from './llm/provider.js';
import { loadFixtures, stripEvalFields } from './fixtures.js';
import { runFullPipeline } from './services/pipeline.js';
import {
  getState,
  getPipelineProgress,
  setProvider,
  resetState,
} from './store.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;

function getProvider() {
  const p = resolveProvider();
  setProvider(p.name);
  return p;
}

const app = express();
const corsOrigins = process.env.CORS_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean);
app.use(
  cors(
    corsOrigins?.length
      ? { origin: corsOrigins, credentials: true }
      : undefined
  )
);
app.use(express.json());

// Allow embedding inside platform Custom Menu iframe
app.use((_req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "frame-ancestors 'self' https://app.gohighlevel.com https://*.gohighlevel.com https://*.leadconnectorhq.com"
  );
  next();
});

app.get('/api/health', (_req, res) => {
  const provider = getProvider();
  const meta = getTranscriptMeta();
  const agentMeta = getAgentMeta();
  res.json({
    ok: true,
    provider: provider.name,
    model: provider.model,
    modelLabel: provider.modelLabel,
    transcriptCount: meta.count,
    transcriptSource: meta.source,
    agentSource: agentMeta.source,
    agentName: agentMeta.name,
    mode: 'live-ai',
    appUrl: (process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`).replace(
      /\/$/,
      ''
    ),
    pipeline: [
      'goal_extraction',
      'transcript_analysis',
      'pattern_detection',
      'test_generation',
      'recommendations',
    ],
  });
});

app.get('/api/agent', (_req, res) => {
  res.json({ ...getActiveAgentConfig(), _meta: getAgentMeta() });
});

app.get('/api/agent/meta', (_req, res) => {
  res.json(getAgentMeta());
});

app.post('/api/agent', (req, res) => {
  try {
    const config = parseAgentPayload(req.body);
    const meta = setAgentConfig(config);
    resetState();
    res.json({ ok: true, agent: getActiveAgentConfig(), ...meta });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/agent/use-sample', (_req, res) => {
  const meta = useSampleAgentConfig();
  resetState();
  res.json({ ok: true, agent: getActiveAgentConfig(), ...meta });
});

app.post('/api/agent/use-generic', (_req, res) => {
  const meta = useGenericAgentConfig();
  resetState();
  res.json({ ok: true, agent: getActiveAgentConfig(), ...meta });
});

app.get('/api/transcripts/meta', (_req, res) => {
  res.json(getTranscriptMeta());
});

app.get('/api/transcripts', (_req, res) => {
  res.json(listTranscriptSummaries());
});

app.get('/api/transcripts/:callId', (req, res) => {
  const t = getPublicTranscript(req.params.callId);
  if (!t) return res.status(404).json({ error: 'Transcript not found' });
  res.json(t);
});

app.post('/api/transcripts/upload', (req, res) => {
  try {
    const parsed = parseTranscriptPayload(req.body);
    const fileNames = req.body?.fileNames ?? [];
    const append = Boolean(req.body?.append);
    const meta = append
      ? appendUploadedTranscripts(parsed, fileNames)
      : setUploadedTranscripts(parsed, fileNames);
    resetState();
    res.json({
      ok: true,
      ...meta,
      callIds: parsed.map((t) => t.callId),
      appended: append,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/transcripts/clear', (_req, res) => {
  const meta = clearTranscripts();
  resetState();
  res.json({ ok: true, ...meta });
});

app.post('/api/transcripts/use-samples', (_req, res) => {
  try {
    const { transcripts } = loadFixtures();
    const cleaned = transcripts.map((t) => ({
      ...stripEvalFields(t),
      _meta: t._meta,
    }));
    const fileNames = cleaned.map((t) => t._meta?.file ?? 'sample');
    const meta = setUploadedTranscripts(cleaned, fileNames);
    resetState();
    res.json({ ok: true, ...meta, callIds: cleaned.map((t) => t.callId) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/state', (_req, res) => {
  res.json(getState());
});

app.get('/api/pipeline/progress', (_req, res) => {
  res.json(getPipelineProgress());
});

app.post('/api/reset', (_req, res) => {
  resetState();
  getProvider();
  res.json({ ok: true });
});

app.post('/api/run/full', async (_req, res) => {
  try {
    const transcripts = getActiveTranscripts();
    if (!transcripts.length) {
      return res.status(400).json({ error: 'Upload at least one transcript first' });
    }
    const provider = getProvider();
    const result = await runFullPipeline(provider, getActiveAgentConfig(), transcripts);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

const frontendDist = path.resolve(__dirname, '../../frontend/dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(frontendDist, 'index.html'), (err) => {
      if (err) next();
    });
  });
}

app.listen(PORT, () => {
  const provider = getProvider();
  const meta = getTranscriptMeta();
  console.log(`Voice Optimizer API on http://localhost:${PORT}`);
  console.log(
    `AI provider: ${provider.modelLabel || provider.name}${provider.model ? ` (${provider.model})` : ''}`
  );
  const agentMeta = getAgentMeta();
  console.log(`Transcripts loaded: ${meta.count} (${meta.source})`);
  console.log(`Agent: ${agentMeta.name} (${agentMeta.source})`);
});
