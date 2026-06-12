<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { api } from './api.js';

const tab = ref('home');
const loading = ref(false);
const pipelineRunning = ref(false);
const pipelineProgress = ref(null);
let progressTimer = null;
const error = ref('');
const uploadMessage = ref('');
const sessionNotice = ref('');
const health = ref(null);
const agent = ref(null);
const agentMeta = ref(null);
const agentGoal = ref('');
const agentPrompt = ref('');
const agentName = ref('');
const agentScript = ref('');
const scriptInput = ref(null);
const transcriptMeta = ref(null);
const transcripts = ref([]);
const pasteJson = ref('');
const isDragging = ref(false);
const fileInput = ref(null);
const state = ref({
  evaluationCriteria: null,
  analyses: [],
  patterns: null,
  testCases: null,
  recommendations: null,
  optimizedAgent: null,
});

const selectedCallId = ref(null);
const selectedTranscript = ref(null);
const selectedAnalysis = ref(null);
const selectedRec = ref(null);
const embedLocationId = ref('');

const tabs = [
  { id: 'home', label: 'Home', icon: '⌂' },
  { id: 'analysis', label: 'Analysis', needs: 'analyses', icon: '◈' },
  { id: 'tests', label: 'Test Cases', needs: 'testCases', icon: '◎' },
  { id: 'evaluation', label: 'Evaluation', needs: 'recommendations', icon: '✦' },
];

function tabReady(t) {
  if (!t.needs) return true;
  if (t.needs === 'analyses') return state.value.analyses.length > 0;
  if (t.needs === 'testCases') return state.value.testCases != null;
  if (t.needs === 'recommendations') return state.value.recommendations != null;
  return true;
}

const optimizedPrompt = computed(() => state.value.optimizedAgent?.prompt ?? '');

const hasPasteContent = computed(() => pasteJson.value.trim().length > 0);
const hasFileTranscripts = computed(() => transcripts.value.length > 0);
const pasteDisabled = computed(() => hasFileTranscripts.value);
const fileDropDisabled = computed(() => hasPasteContent.value);
const hasAgentConfig = computed(
  () =>
    Boolean(agentPrompt.value.trim() || agentGoal.value.trim() || agentScript.value.trim())
);
const canAnalyze = computed(
  () =>
    hasAgentConfig.value &&
    (hasFileTranscripts.value || hasPasteContent.value) &&
    !loading.value &&
    !pipelineRunning.value
);
const pastePlaceholder = computed(() =>
  pasteDisabled.value
    ? 'Clear uploaded files to paste JSON instead'
    : '{ "turns": [{ "speaker": "agent", "text": "..." }] }'
);

function analysisForCall(callId) {
  return state.value.analyses.find((a) => (a.call_id ?? a.callId) === callId) ?? null;
}

const PLACEHOLDER_OBJECTION_TYPES =
  /^(none|n\/a|no objection|no objections?|no objections? raised?|not applicable)$/i;

function meaningfulObjections(objections) {
  if (!Array.isArray(objections)) return [];
  return objections.filter((obj) => {
    const type = String(obj?.type ?? '').trim();
    return type && !PLACEHOLDER_OBJECTION_TYPES.test(type);
  });
}

function formatObjectionType(type) {
  return String(type ?? '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const selectedObjections = computed(() =>
  meaningfulObjections(selectedAnalysis.value?.objections)
);

function badgeClass(variant) {
  const map = {
    success: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    warning: 'bg-amber-50 text-amber-700 ring-amber-600/20',
    danger: 'bg-rose-50 text-rose-700 ring-rose-600/20',
    info: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  };
  return `inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset ${map[variant] ?? map.info}`;
}

async function refresh() {
  const [h, a, am, m, t, s] = await Promise.all([
    api.health(),
    api.agent(),
    api.agentMeta(),
    api.transcriptMeta(),
    api.transcripts(),
    api.state(),
  ]);
  health.value = h;
  agent.value = a;
  agentMeta.value = am;
  agentGoal.value = a.goal ?? '';
  agentPrompt.value = a.prompt ?? '';
  agentName.value = a.name ?? '';
  transcriptMeta.value = m;
  transcripts.value = t;
  state.value = s;
  syncSelectedCallView();
}

function syncSelectedCallView() {
  if (!state.value.analyses.length) {
    selectedCallId.value = null;
    selectedTranscript.value = null;
    selectedAnalysis.value = null;
    return;
  }
  const stillValid = state.value.analyses.some(
    (a) => (a.call_id ?? a.callId) === selectedCallId.value
  );
  if (!stillValid) {
    const first = state.value.analyses[0];
    selectedCallId.value = first.call_id ?? first.callId;
    selectedTranscript.value = null;
  }
  selectedAnalysis.value = analysisForCall(selectedCallId.value);
}

function parseFilesJson(text, fileName) {
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`${fileName}: invalid JSON — ${e.message}`);
  }
}

async function uploadPayload(data, fileNames = [], { append = false } = {}) {
  loading.value = true;
  error.value = '';
  uploadMessage.value = '';
  try {
    const result = await api.uploadTranscripts({ data, fileNames, append });
    const verb = result.appended ? 'Added' : 'Loaded';
    uploadMessage.value = `${verb} ${result.callIds.length} call(s) — ${result.count} total ready to analyze`;
    await refresh();
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

async function handleFiles(fileList) {
  if (fileDropDisabled.value) return;
  const files = [...fileList].filter((f) => f.name.endsWith('.json'));
  if (!files.length) {
    error.value = 'Please upload .json transcript file(s)';
    return;
  }
  const roots = [];
  const names = [];
  try {
    for (const file of files) {
      const text = await file.text();
      roots.push(parseFilesJson(text, file.name));
      names.push(file.name);
    }
    const data = roots.length === 1 ? roots[0] : roots;
    pasteJson.value = '';
    await uploadPayload(data, names, { append: hasFileTranscripts.value });
  } catch (e) {
    error.value = e.message;
  }
}

function onFileChange(e) {
  if (fileDropDisabled.value) {
    e.target.value = '';
    return;
  }
  if (e.target.files?.length) handleFiles(e.target.files);
  e.target.value = '';
}

function onDrop(e) {
  isDragging.value = false;
  if (fileDropDisabled.value) return;
  if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files);
}

function openFilePicker() {
  if (!fileDropDisabled.value) fileInput.value?.click();
}

async function clearUploadedTranscripts() {
  loading.value = true;
  error.value = '';
  try {
    await api.clearTranscripts();
    uploadMessage.value = '';
    await refresh();
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

async function ensureTranscriptsLoaded() {
  if (hasFileTranscripts.value) return true;
  if (!hasPasteContent.value) return false;
  try {
    const parsed = parseFilesJson(pasteJson.value, 'pasted.json');
    await uploadPayload(parsed, ['pasted.json']);
    pasteJson.value = '';
    return true;
  } catch (e) {
    error.value = e.message;
    return false;
  }
}

function buildPromptForSave() {
  const base = agentPrompt.value.trim();
  const script = agentScript.value.trim();
  if (!script) return base;
  const block = `--- CALL SCRIPT / FLOW ---\n${script}`;
  return base ? `${base}\n\n${block}` : block;
}

async function handleScriptFile(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    agentScript.value = await file.text();
    uploadMessage.value = `Loaded script: ${file.name}`;
  } catch (err) {
    error.value = err.message;
  }
  e.target.value = '';
}

async function saveAgentFields() {
  loading.value = true;
  error.value = '';
  try {
    await api.saveAgentFields({
      name: agentName.value || 'Voice AI Agent',
      goal: agentGoal.value,
      prompt: buildPromptForSave(),
    });
    await refresh();
    uploadMessage.value = 'Agent configuration saved';
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

async function loadSampleAgent() {
  loading.value = true;
  try {
    await api.useSampleAgent();
    await refresh();
    uploadMessage.value = 'Loaded sample HVAC agent config';
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

async function loadSampleTranscripts() {
  loading.value = true;
  error.value = '';
  pasteJson.value = '';
  try {
    const result = await api.useSampleTranscripts();
    uploadMessage.value = `Loaded ${result.count} sample call transcripts — click Analyze when ready`;
    await refresh();
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

function navigateAfterPipelineComplete() {
  const recs = state.value.recommendations?.recommendations;
  if (recs?.length) selectedRec.value = recs[0];
  // Only auto-navigate when the user stayed on Home — respect manual tab picks during a run.
  if (tab.value === 'home') {
    tab.value = defaultResultsTab();
  }
}

function finishPipelineFromPoll() {
  pipelineRunning.value = false;
  stopProgressPoll();
  if (pipelineProgress.value?.step === 'error') {
    error.value = pipelineProgress.value.detail;
    sessionNotice.value = hasFileTranscripts.value
      ? `Analysis failed. ${transcripts.value.length} transcript(s) still loaded — fix the issue and click Analyze again.`
      : 'Analysis failed. Upload transcripts and click Analyze to try again.';
    return;
  }
  sessionNotice.value = '';
  navigateAfterPipelineComplete();
}

function startProgressPoll() {
  stopProgressPoll();
  progressTimer = setInterval(async () => {
    try {
      pipelineProgress.value = await api.pipelineProgress();
      if (!pipelineProgress.value.running) {
        if (pipelineRunning.value) {
          await refresh();
          finishPipelineFromPoll();
        }
        return;
      }
      await refresh();
    } catch {
      /* ignore poll errors */
    }
  }, 800);
}

function stopProgressPoll() {
  if (progressTimer) {
    clearInterval(progressTimer);
    progressTimer = null;
  }
}

async function analyzeAndRun() {
  error.value = '';
  uploadMessage.value = '';
  sessionNotice.value = '';
  if (!hasAgentConfig.value) {
    error.value = 'Add an agent prompt, goal, or call script before analyzing.';
    return;
  }
  if (!(hasFileTranscripts.value || hasPasteContent.value)) {
    error.value = 'Upload transcript files or paste JSON before analyzing.';
    return;
  }
  if (!(await ensureTranscriptsLoaded())) return;
  loading.value = true;
  try {
    await api.saveAgentFields({
      name: agentName.value || 'Voice AI Agent',
      goal: agentGoal.value || "Complete the agent's intended objective on each call.",
      prompt: buildPromptForSave(),
    });
    await refresh();
  } catch (e) {
    error.value = e.message;
    loading.value = false;
    return;
  }
  loading.value = false;
  await run();
}

async function run() {
  pipelineRunning.value = true;
  pipelineProgress.value = {
    running: true,
    step: 'starting',
    detail: 'Starting pipeline…',
    percent: 0,
  };
  startProgressPoll();
  error.value = '';
  try {
    await api.runFull();
    await refresh();
    navigateAfterPipelineComplete();
    sessionNotice.value = '';
  } catch (e) {
    error.value = e.message;
  } finally {
    try {
      pipelineProgress.value = await api.pipelineProgress();
      await refresh();
      finishPipelineFromPoll();
    } catch {
      pipelineProgress.value = null;
      pipelineRunning.value = false;
      stopProgressPoll();
    }
  }
}

async function selectTranscript(callId) {
  selectedCallId.value = callId;
  selectedTranscript.value = await api.transcript(callId);
  selectedAnalysis.value = analysisForCall(callId);
  switchTab('analysis');
}

function goalBadge(achieved) {
  return achieved ? 'success' : 'danger';
}

function severityBadge(sev) {
  if (sev === 'high') return 'danger';
  if (sev === 'medium') return 'warning';
  return 'info';
}

function formatTaskName(task) {
  return String(task).replace(/_/g, ' ');
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function switchTab(id) {
  const target = tabs.find((t) => t.id === id);
  if (!target || !tabReady(target)) return;
  tab.value = id;
}

watch(tab, async () => {
  await nextTick();
  scrollToTop();
});

function defaultResultsTab() {
  if (state.value.recommendations) return 'evaluation';
  if (state.value.analyses.length) return 'analysis';
  return 'home';
}

onMounted(async () => {
  try {
    selectedCallId.value = null;
    selectedTranscript.value = null;
    selectedAnalysis.value = null;
    selectedRec.value = null;
    sessionNotice.value = '';

    const progress = await api.pipelineProgress();
    await refresh();

    const params = new URLSearchParams(window.location.search);
    embedLocationId.value = params.get('locationId') || params.get('location_id') || '';

    if (progress.running) {
      pipelineRunning.value = true;
      pipelineProgress.value = progress;
      startProgressPoll();
      sessionNotice.value = 'Analysis is still running — progress will update below.';
      tab.value = state.value.analyses.length ? 'analysis' : 'home';
      return;
    }

    const hasCompleteRun = Boolean(state.value.recommendations);
    const hasPartialRun =
      state.value.analyses.length > 0 || state.value.patterns || state.value.testCases;

    if (hasCompleteRun) {
      tab.value = defaultResultsTab();
      return;
    }

    if (hasPartialRun || progress.step === 'error') {
      await api.reset();
      await refresh();
      if (hasFileTranscripts.value) {
        sessionNotice.value = `Previous run was interrupted. ${transcripts.value.length} transcript(s) still loaded — click Analyze to run again.`;
      } else {
        sessionNotice.value =
          'Previous run was interrupted. Upload transcripts or paste JSON, then click Analyze.';
      }
      tab.value = 'home';
      return;
    }

    if (hasFileTranscripts.value) {
      sessionNotice.value = `${transcripts.value.length} transcript(s) loaded — click Analyze when ready.`;
    }

    tab.value = 'home';
  } catch (e) {
    error.value = e.message;
  }
});
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/40 text-slate-900">
    <!-- Header -->
    <header class="sticky top-0 z-30 border-b border-slate-200/80 bg-white/80 backdrop-blur-md">
      <div class="mx-auto max-w-6xl px-4 py-4 sm:px-6">
        <div class="flex items-center gap-2">
          <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-sm text-white shadow-sm">AI</span>
          <h1 class="text-xl font-bold tracking-tight text-slate-900">Voice AI Agent Optimizer</h1>
        </div>
        <p class="mt-1 text-sm text-slate-500">Upload past calls · find flaws · generate tests · optimize</p>
      </div>

      <!-- Tabs -->
      <nav class="mx-auto max-w-6xl px-4 sm:px-6">
        <div class="flex gap-1 overflow-x-auto pb-px">
          <button
            v-for="t in tabs"
            :key="t.id"
            :disabled="!tabReady(t)"
            :class="[
              'flex items-center gap-1.5 whitespace-nowrap rounded-t-lg px-4 py-2.5 text-sm font-medium transition',
              tab === t.id
                ? 'border border-b-0 border-slate-200 bg-white text-blue-600 shadow-sm'
                : 'text-slate-500 hover:bg-slate-100/80 hover:text-slate-700',
              !tabReady(t) ? 'cursor-not-allowed opacity-40' : '',
            ]"
            @click="switchTab(t.id)"
          >
            <span class="text-xs opacity-60">{{ t.icon }}</span>
            {{ t.label }}
            <span v-if="t.needs && tabReady(t)" class="h-1.5 w-1.5 rounded-full bg-blue-500" />
          </button>
        </div>
      </nav>
    </header>

    <div class="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <!-- Error -->
      <div
        v-if="error"
        class="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
      >
        {{ error }}
      </div>

      <!-- Session notice (refresh / reconnect) -->
      <div
        v-if="sessionNotice && !pipelineRunning"
        class="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
      >
        {{ sessionNotice }}
      </div>

      <!-- Pipeline progress -->
      <div
        v-if="pipelineRunning"
        class="mb-6 rounded-xl border border-blue-200 bg-blue-50/60 p-5 shadow-sm"
      >
        <div class="mb-2 flex items-center justify-between text-sm font-semibold text-blue-900">
          <span>Analyzing…</span>
          <span>{{ pipelineProgress?.percent ?? 0 }}%</span>
        </div>
        <div class="h-2 overflow-hidden rounded-full bg-white">
          <div
            class="h-full rounded-full bg-blue-600 transition-all duration-300"
            :style="{ width: (pipelineProgress?.percent ?? 0) + '%' }"
          />
        </div>
        <p class="mt-2 text-sm text-blue-800">{{ pipelineProgress?.detail || 'This can take several minutes.' }}</p>
        <p class="mt-1 text-xs text-blue-600/80">
          Keep this tab open. Partial results appear in Analysis as each call completes.
        </p>
      </div>

      <main>
        <!-- Home -->
        <section v-show="tab === 'home'" class="mx-auto max-w-4xl space-y-5">
          <div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 class="text-lg font-semibold text-slate-900">Optimize your Voice AI agent</h2>
            <p class="mt-2 text-sm text-slate-600">
              Upload <strong>multiple past call transcripts</strong> from your voice agent. We analyze every call for
              flaws and missed opportunities, then generate test cases and prompt improvements.
            </p>
            <ol class="mt-4 grid gap-3 sm:grid-cols-4">
              <li class="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <span class="font-bold text-blue-600">1.</span> Upload past calls (JSON)
              </li>
              <li class="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <span class="font-bold text-blue-600">2.</span> Analysis — patterns &amp; failures
              </li>
              <li class="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <span class="font-bold text-blue-600">3.</span> Test cases from patterns
              </li>
              <li class="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <span class="font-bold text-blue-600">4.</span> Evaluation — recommended fixes
              </li>
            </ol>
          </div>

          <!-- Transcripts panel (primary) -->
          <div class="rounded-2xl border border-blue-200 bg-white p-5 shadow-sm ring-1 ring-blue-100">
            <div class="mb-4 flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 class="text-sm font-semibold uppercase tracking-wide text-slate-400">Past call transcripts</h3>
                <p class="mt-1 text-sm text-slate-500">
                  One JSON file per call, or select many at once. Drop more anytime to add to the batch.
                </p>
              </div>
              <span
                v-if="transcripts.length"
                class="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700"
              >
                {{ transcripts.length }} call{{ transcripts.length === 1 ? '' : 's' }} loaded
              </span>
            </div>

            <div
              :class="[
                'mb-4 rounded-xl border-2 border-dashed p-8 text-center transition',
                fileDropDisabled
                  ? 'cursor-not-allowed border-slate-200 bg-slate-100/80 opacity-60'
                  : isDragging
                    ? 'cursor-pointer border-blue-400 bg-blue-50'
                    : 'cursor-pointer border-blue-200 bg-blue-50/30 hover:border-blue-400 hover:bg-blue-50',
              ]"
              @dragover.prevent="!fileDropDisabled && (isDragging = true)"
              @dragleave.prevent="isDragging = false"
              @drop.prevent="onDrop"
              @click="openFilePicker"
            >
              <input
                ref="fileInput"
                type="file"
                accept=".json,application/json"
                multiple
                hidden
                :disabled="fileDropDisabled"
                @change="onFileChange"
              />
              <p class="text-base font-semibold text-slate-800">
                {{ transcripts.length ? 'Add more call transcripts' : 'Drop call transcript JSON files here' }}
              </p>
              <p class="mt-1 text-sm text-slate-500">
                {{
                  fileDropDisabled
                    ? 'Clear pasted JSON to upload files'
                    : 'Click to browse · select multiple files · one call per file (or combined JSON)'
                }}
              </p>
            </div>

            <div v-if="transcripts.length" class="mb-4">
              <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h4 class="text-xs font-semibold uppercase tracking-wide text-slate-400">Loaded calls</h4>
                <button
                  type="button"
                  class="text-xs font-medium text-slate-500 hover:text-slate-700 hover:underline"
                  :disabled="loading"
                  @click="clearUploadedTranscripts"
                >
                  Clear all
                </button>
              </div>
              <ul class="max-h-48 space-y-2 overflow-y-auto">
                <li
                  v-for="t in transcripts"
                  :key="t.callId"
                  class="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                >
                  <div class="min-w-0">
                    <span class="font-medium text-slate-800">{{ t.callId }}</span>
                    <p v-if="t.summary" class="truncate text-xs text-slate-500">{{ t.summary }}</p>
                  </div>
                  <span class="shrink-0 text-xs text-slate-400">{{ t.turnCount }} turns</span>
                </li>
              </ul>
            </div>

            <div v-else class="mb-4 text-center">
              <button
                type="button"
                class="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100 disabled:opacity-50"
                :disabled="loading"
                @click="loadSampleTranscripts"
              >
                Load sample calls (12)
              </button>
            </div>

            <details class="text-sm">
              <summary class="cursor-pointer text-slate-500">Or paste a single JSON array of calls</summary>
              <textarea
                v-model="pasteJson"
                rows="4"
                :disabled="pasteDisabled"
                :class="[
                  'mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100',
                  pasteDisabled
                    ? 'cursor-not-allowed bg-slate-100 text-slate-400 opacity-60'
                    : 'bg-slate-50 focus:bg-white',
                ]"
                :placeholder="pastePlaceholder"
              />
              <p v-if="pasteDisabled" class="mt-1 text-xs text-slate-400">File upload active — paste is disabled.</p>
              <p v-else-if="hasPasteContent" class="mt-1 text-xs text-slate-400">
                Pasted JSON loads when you click Analyze.
              </p>
            </details>
          </div>

          <div class="grid gap-5 md:grid-cols-1">
            <!-- Agent panel -->
            <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 class="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-400">Voice agent config</h3>
              <p class="mb-4 text-xs text-slate-500">Used to extract goals and evaluate each call against your script.</p>
              <label class="mb-1 block text-xs font-medium text-slate-600">Agent name</label>
              <input
                v-model="agentName"
                class="mb-3 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
                placeholder="e.g. Acme Dental Booking Agent"
              />
              <label class="mb-1 block text-xs font-medium text-slate-600">Goal</label>
              <textarea
                v-model="agentGoal"
                rows="2"
                class="mb-3 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
                placeholder="What should this agent achieve on each call?"
              />
              <label class="mb-1 block text-xs font-medium text-slate-600">System prompt</label>
              <textarea
                v-model="agentPrompt"
                rows="5"
                class="mb-3 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
                placeholder="Paste the system prompt, policies, and instructions…"
              />
              <label class="mb-1 block text-xs font-medium text-slate-600">Call script / flow (optional)</label>
              <textarea
                v-model="agentScript"
                rows="4"
                class="mb-3 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
                placeholder="Objection handling, qualification steps, closing script…"
              />
              <div class="flex flex-wrap gap-2">
                <button
                  type="button"
                  class="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                  @click="scriptInput?.click()"
                >
                  Upload script file
                </button>
                <input ref="scriptInput" type="file" accept=".txt,.md,.json,text/*" hidden @change="handleScriptFile" />
                <button
                  class="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
                  :disabled="loading"
                  @click="loadSampleAgent"
                >
                  Load sample agent
                </button>
              </div>
            </div>
          </div>

          <div class="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
            <button
              class="rounded-xl bg-blue-600 px-8 py-3 text-base font-semibold text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="!canAnalyze"
              @click="analyzeAndRun"
            >
              {{
                pipelineRunning
                  ? `Analyzing ${transcripts.length} call${transcripts.length === 1 ? '' : 's'}…`
                  : loading
                    ? 'Saving…'
                    : transcripts.length
                      ? `Analyze ${transcripts.length} call${transcripts.length === 1 ? '' : 's'}`
                      : 'Analyze'
              }}
            </button>
            <p class="mt-2 text-xs text-slate-400">
              Analyzes every uploaded call for flaws, aggregates patterns, generates test cases, and recommends fixes.
            </p>
          </div>

          <p
            v-if="uploadMessage"
            class="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
          >
            {{ uploadMessage }}
          </p>
        </section>

        <!-- Analysis -->
        <section v-show="tab === 'analysis'" class="space-y-5">
          <div
            v-if="!state.analyses.length"
            class="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-400 shadow-sm"
          >
            Complete setup on <strong class="text-slate-600">Home</strong> and click <strong class="text-slate-600">Analyze</strong>.
          </div>

          <div v-if="state.patterns" class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 class="text-base font-semibold text-slate-900">Executive summary</h2>
            <div class="mt-4 flex flex-wrap gap-6">
              <div>
                <span class="text-xs font-medium uppercase tracking-wide text-slate-400">Calls analyzed</span>
                <p class="text-2xl font-bold text-slate-900">
                  {{ state.patterns.executiveSummary?.calls_analyzed ?? state.analyses.length }}
                </p>
              </div>
              <div>
                <span class="text-xs font-medium uppercase tracking-wide text-slate-400">Goal achievement</span>
                <p class="text-2xl font-bold text-slate-900">
                  {{ state.patterns.executiveSummary?.goal_achievement_rate ?? 0 }}%
                </p>
              </div>
            </div>

            <h3 class="mt-6 mb-3 text-sm font-semibold text-slate-700">Recurring failures</h3>
            <div v-if="state.patterns.recurring_failures?.length" class="space-y-2">
              <div
                v-for="issue in state.patterns.recurring_failures"
                :key="issue.issue"
                class="rounded-lg bg-slate-50 px-3 py-2 text-sm"
              >
                <div class="flex flex-wrap items-center gap-3">
                  <span :class="badgeClass(severityBadge(issue.severity?.toLowerCase?.() ?? 'medium'))">
                    {{ issue.severity }}
                  </span>
                  <span class="font-medium text-slate-800">{{ issue.issue }}</span>
                  <span class="text-slate-500">{{ issue.frequency }} call(s)</span>
                </div>
                <p v-if="issue.business_impact" class="mt-1 text-xs text-slate-500">{{ issue.business_impact }}</p>
              </div>
            </div>
            <p v-else class="text-sm text-slate-400">No recurring failures detected.</p>

            <h3 class="mt-6 mb-3 text-sm font-semibold text-slate-700">Recurring strengths</h3>
            <div v-if="state.patterns.recurring_strengths?.length" class="flex flex-wrap gap-2">
              <span
                v-for="s in state.patterns.recurring_strengths"
                :key="s.issue"
                class="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-600/20"
              >
                {{ s.issue }} ({{ s.frequency }})
              </span>
            </div>
            <p v-else class="text-sm text-slate-400">No recurring strengths detected.</p>
          </div>

          <div v-if="state.analyses.length" class="grid gap-5 lg:grid-cols-2">
            <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 class="mb-3 text-sm font-semibold text-slate-700">Calls</h3>
              <div class="max-h-[70vh] space-y-2 overflow-y-auto">
                <button
                  v-for="t in transcripts"
                  :key="t.callId"
                  :class="[
                    'w-full rounded-xl border p-3 text-left transition',
                    selectedCallId === t.callId
                      ? 'border-blue-300 bg-blue-50 shadow-sm'
                      : 'border-slate-200 bg-slate-50/50 hover:border-slate-300 hover:bg-white',
                  ]"
                  @click="selectTranscript(t.callId)"
                >
                  <div class="flex items-center justify-between gap-2">
                    <strong class="text-sm text-slate-800">{{ t.callId }}</strong>
                    <span
                      v-if="analysisForCall(t.callId)"
                      :class="badgeClass(goalBadge(analysisForCall(t.callId).goal_achieved))"
                    >
                      {{ analysisForCall(t.callId).goal_achieved ? 'Goal met' : 'Goal missed' }}
                    </span>
                  </div>
                  <p class="mt-1 line-clamp-2 text-xs text-slate-500">{{ t.summary }}</p>
                </button>
              </div>
            </div>
            <div v-if="selectedTranscript" class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 class="mb-3 text-sm font-semibold text-slate-700">{{ selectedTranscript.callId }}</h3>
              <div class="max-h-80 space-y-2 overflow-y-auto">
                <div
                  v-for="turn in selectedTranscript.turns"
                  :key="turn.turnIndex"
                  :class="[
                    'rounded-xl px-3 py-2 text-sm',
                    turn.speaker === 'agent'
                      ? 'mr-8 bg-blue-50 text-slate-800'
                      : 'ml-8 bg-slate-100 text-slate-700',
                  ]"
                >
                  <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400">{{ turn.speaker }}</span>
                  <p class="mt-0.5">{{ turn.text }}</p>
                </div>
              </div>
            </div>
          </div>

          <div
            v-if="selectedAnalysis"
            class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <div class="mb-3 flex flex-wrap items-center gap-3">
              <h3 class="text-base font-semibold text-slate-900">
                {{ selectedAnalysis.call_id ?? selectedAnalysis.callId }}
              </h3>
              <span :class="badgeClass(goalBadge(selectedAnalysis.goal_achieved))">
                {{ selectedAnalysis.goal_achieved ? 'Goal achieved' : 'Goal not achieved' }}
              </span>
            </div>

            <h4 class="mt-4 mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Task completion</h4>
            <div class="flex flex-wrap gap-2">
              <span
                v-for="(done, task) in selectedAnalysis.task_completion"
                :key="task"
                :class="[
                  'rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset',
                  done
                    ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
                    : 'bg-rose-50 text-rose-700 ring-rose-600/20',
                ]"
              >
                {{ formatTaskName(task) }} — {{ done ? 'done' : 'missed' }}
              </span>
            </div>

            <div class="mt-4">
              <h4 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Objections</h4>
              <div v-if="selectedObjections.length" class="space-y-2">
                <div
                  v-for="(obj, i) in selectedObjections"
                  :key="i"
                  class="flex items-center gap-2 text-sm text-slate-600"
                >
                  <span :class="badgeClass(obj.handled ? 'success' : 'danger')">{{ formatObjectionType(obj.type) }}</span>
                  <span>{{ obj.handled ? 'Handled' : 'Not handled' }}</span>
                </div>
              </div>
              <p v-else class="text-sm text-slate-500">None — caller did not raise an objection.</p>
            </div>

            <div class="mt-4">
              <h4 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Strengths</h4>
              <ul v-if="selectedAnalysis.strengths?.length" class="list-inside list-disc space-y-1 text-sm text-slate-600">
                <li v-for="(s, i) in selectedAnalysis.strengths" :key="i">{{ s }}</li>
              </ul>
              <p v-else class="text-sm text-slate-500">None noted.</p>
            </div>

            <div class="mt-4">
              <h4 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Failures</h4>
              <ul v-if="selectedAnalysis.failures?.length" class="list-inside list-disc space-y-1 text-sm text-slate-600">
                <li v-for="(f, i) in selectedAnalysis.failures" :key="i">{{ f }}</li>
              </ul>
              <p v-else class="text-sm text-slate-500">None identified.</p>
            </div>
          </div>
          <div
            v-else-if="state.analyses.length"
            class="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-400"
          >
            Select a call above to view task completion, objections, strengths, and failures.
          </div>
        </section>

        <!-- Tests -->
        <section v-show="tab === 'tests'" class="space-y-5">
          <div
            v-if="!state.testCases"
            class="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-400 shadow-sm"
          >
            Generate test cases after running analysis.
          </div>
          <template v-else>
            <div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 class="text-base font-semibold text-slate-900">Generated test scenarios</h2>
              <p class="mt-1 text-sm text-slate-500">
                Derived from recurring failures across
                {{ state.patterns?.executiveSummary?.calls_analyzed ?? state.analyses.length }} analyzed call(s).
                Validate each on your live voice agent after applying fixes.
              </p>
            </div>
            <div
              v-for="tc in state.testCases.testCases"
              :key="tc.id"
              class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <div class="mb-3 flex flex-wrap items-center gap-2">
                <h3 class="text-base font-semibold text-slate-900">{{ tc.persona }}</h3>
                <span :class="badgeClass('warning')">{{ tc.failure_target }}</span>
              </div>
              <p class="text-sm text-slate-600"><strong>Scenario:</strong> {{ tc.scenario }}</p>
              <h4 class="mt-4 mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Expected behavior</h4>
              <ul class="list-inside list-disc space-y-1 text-sm text-slate-600">
                <li v-for="(b, i) in tc.expected_behavior" :key="i">{{ b }}</li>
              </ul>
              <h4 class="mt-4 mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Success criteria</h4>
              <ul class="list-inside list-disc space-y-1 text-sm text-slate-600">
                <li v-for="(c, i) in tc.success_criteria" :key="i">{{ c }}</li>
              </ul>
            </div>
          </template>
        </section>

        <!-- Evaluation -->
        <section v-show="tab === 'evaluation'" class="space-y-5">
          <div
            v-if="!state.recommendations"
            class="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-400 shadow-sm"
          >
            Run Analyze to generate optimization recommendations and a validation plan.
          </div>
          <template v-else>
            <div class="rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-6 shadow-sm">
              <h2 class="text-base font-semibold text-slate-900">Validate on your voice agent</h2>
              <p class="mt-2 text-sm text-slate-600">
                Apply the optimized prompt below in your voice agent, then call the agent for each test scenario on the
                <strong>Test Cases</strong> tab. Re-upload new call transcripts here to measure improvement.
              </p>
              <ol class="mt-4 list-decimal space-y-2 pl-5 text-sm text-slate-700">
                <li>Copy the optimized prompt into your voice agent settings.</li>
                <li>Save and publish the updated agent configuration.</li>
                <li>Call your agent's phone number — role-play each scenario from the Test Cases tab.</li>
                <li>Check success criteria during the live call (see Test Cases tab).</li>
                <li>Export new call logs and re-run Analyze to measure improvement.</li>
              </ol>
            </div>

            <div v-if="optimizedPrompt" class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 class="mb-2 text-sm font-semibold text-slate-700">Optimized prompt (copy into your voice agent)</h3>
              <p v-if="state.optimizedAgent?.temperature != null" class="mb-3 text-xs text-slate-500">
                Suggested temperature: {{ state.optimizedAgent.temperature }}
              </p>
              <div class="max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-xs whitespace-pre-wrap text-slate-700">
                {{ optimizedPrompt }}
              </div>
            </div>

            <div
              v-if="state.testCases?.testCases?.length"
              class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <h3 class="mb-2 text-sm font-semibold text-slate-700">Live voice test checklist</h3>
              <p class="mb-4 text-sm text-slate-500">
                {{ state.testCases.testCases.length }} scenario(s) to run against your voice agent after applying changes.
              </p>
              <div class="space-y-3">
                <div
                  v-for="tc in state.testCases.testCases"
                  :key="tc.id"
                  class="rounded-xl border border-slate-200 bg-slate-50/50 p-4"
                >
                  <div class="flex flex-wrap items-center gap-2">
                    <strong class="text-sm text-slate-800">{{ tc.persona }}</strong>
                    <span :class="badgeClass('warning')">{{ tc.failure_target }}</span>
                  </div>
                  <p class="mt-1 text-xs text-slate-500">{{ tc.scenario }}</p>
                </div>
              </div>
            </div>

            <div class="grid gap-5 lg:grid-cols-[280px_1fr]">
              <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 class="mb-3 text-sm font-semibold text-slate-700">Recommended changes</h2>
                <div class="max-h-[80vh] space-y-2 overflow-y-auto">
                  <button
                    v-for="r in state.recommendations?.recommendations ?? []"
                    :key="r.id"
                    :class="[
                      'block w-full rounded-xl border p-3 text-left transition',
                      selectedRec?.id === r.id
                        ? 'border-blue-300 bg-blue-50'
                        : 'border-slate-200 bg-slate-50/50 hover:bg-white',
                    ]"
                    @click="selectedRec = r"
                  >
                    <span :class="badgeClass(severityBadge(String(r.priority).toLowerCase() === 'high' ? 'high' : 'medium'))">
                      {{ r.priority }}
                    </span>
                    <strong class="mt-1 block text-sm text-slate-800">{{ r.category }}</strong>
                    <p class="mt-1 line-clamp-2 text-xs text-slate-500">{{ r.issue }}</p>
                  </button>
                </div>
              </div>
              <div v-if="selectedRec" class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 class="text-base font-semibold capitalize text-slate-900">
                  {{ selectedRec.category }} · {{ selectedRec.priority }} priority
                </h2>
                <p v-if="selectedRec.issue" class="mt-2 text-sm font-medium text-slate-800">{{ selectedRec.issue }}</p>
                <p class="mt-2 text-sm text-slate-600">{{ selectedRec.reason }}</p>
                <p class="mt-3 text-sm text-slate-600">
                  <strong>Expected impact:</strong> {{ selectedRec.expected_impact }}
                </p>
                <div class="mt-5 grid gap-4 md:grid-cols-2">
                  <div>
                    <h4 class="mb-1 text-xs font-semibold uppercase tracking-wide text-rose-500">Before</h4>
                    <p class="mb-2 text-xs text-slate-500">Exact excerpt from your current agent prompt</p>
                    <div class="max-h-60 overflow-y-auto rounded-xl border-l-4 border-rose-400 bg-slate-50 p-4 font-mono text-xs whitespace-pre-wrap text-slate-700">
                      {{ selectedRec.before }}
                    </div>
                  </div>
                  <div>
                    <h4 class="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-500">After</h4>
                    <p class="mb-2 text-xs text-slate-500">Replacement text for that excerpt (also merged into Optimized prompt above)</p>
                    <div class="max-h-60 overflow-y-auto rounded-xl border-l-4 border-emerald-400 bg-slate-50 p-4 font-mono text-xs whitespace-pre-wrap text-slate-700">
                      {{ selectedRec.after }}
                    </div>
                  </div>
                </div>
              </div>
              <div v-else class="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-400">
                Select a change to see before/after.
              </div>
            </div>
          </template>
        </section>
      </main>

      <footer class="mt-10 border-t border-slate-200 pt-6 text-center text-xs text-slate-400">
        <span v-if="embedLocationId">Embedded · location {{ embedLocationId }}</span>
        <span v-else>Local dev mode</span>
        · Agent: {{ agent?.model }} @ temp {{ agent?.temperature }}
      </footer>
    </div>
  </div>
</template>
