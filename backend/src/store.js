const state = {
  evaluationCriteria: null,
  analyses: [],
  patterns: null,
  testCases: null,
  recommendations: null,
  optimizedAgent: null,
  lastRunAt: null,
  provider: null,
  pipelineProgress: {
    running: false,
    step: '',
    detail: '',
    current: 0,
    total: 0,
    percent: 0,
  },
};

let persistSession = () => {};

export function bindSessionPersistence(saveFn) {
  persistSession = typeof saveFn === 'function' ? saveFn : () => {};
}

function touchSession() {
  try {
    persistSession();
  } catch {
    /* persistence is best-effort */
  }
}

export function getState() {
  return { ...state };
}

export function snapshotPipelineState() {
  return {
    evaluationCriteria: state.evaluationCriteria,
    analyses: state.analyses,
    patterns: state.patterns,
    testCases: state.testCases,
    recommendations: state.recommendations,
    optimizedAgent: state.optimizedAgent,
    lastRunAt: state.lastRunAt,
    provider: state.provider,
    pipelineProgress: {
      ...state.pipelineProgress,
      running: false,
    },
  };
}

export function restorePipelineState(saved) {
  if (!saved || typeof saved !== 'object') return;
  state.evaluationCriteria = saved.evaluationCriteria ?? null;
  state.analyses = saved.analyses ?? [];
  state.patterns = saved.patterns ?? null;
  state.testCases = saved.testCases ?? null;
  state.recommendations = saved.recommendations ?? null;
  state.optimizedAgent = saved.optimizedAgent ?? null;
  state.lastRunAt = saved.lastRunAt ?? null;
  state.provider = saved.provider ?? null;
  state.pipelineProgress = {
    running: false,
    step: saved.pipelineProgress?.step ?? '',
    detail: saved.pipelineProgress?.detail ?? '',
    current: saved.pipelineProgress?.current ?? 0,
    total: saved.pipelineProgress?.total ?? 0,
    percent: saved.pipelineProgress?.percent ?? 0,
  };
}

export function getPipelineProgress() {
  return { ...state.pipelineProgress };
}

export function setPipelineProgress(update) {
  state.pipelineProgress = { ...state.pipelineProgress, ...update };
}

export function resetPipelineProgress() {
  state.pipelineProgress = {
    running: false,
    step: '',
    detail: '',
    current: 0,
    total: 0,
    percent: 0,
  };
}

export function setEvaluationCriteria(criteria) {
  state.evaluationCriteria = criteria;
  state.lastRunAt = new Date().toISOString();
  touchSession();
}

export function setAnalyses(analyses) {
  state.analyses = analyses;
  state.lastRunAt = new Date().toISOString();
  touchSession();
}

export function setPatterns(patterns) {
  state.patterns = patterns;
  touchSession();
}

export function setTestCases(testCases) {
  state.testCases = testCases;
  touchSession();
}

export function setRecommendations(recommendations) {
  state.recommendations = recommendations;
  touchSession();
}

export function setOptimizedAgent(optimizedAgent) {
  state.optimizedAgent = optimizedAgent;
  touchSession();
}

export function setProvider(provider) {
  state.provider = provider;
}

export function resetState() {
  state.evaluationCriteria = null;
  state.analyses = [];
  state.patterns = null;
  state.testCases = null;
  state.recommendations = null;
  state.optimizedAgent = null;
  state.lastRunAt = null;
  resetPipelineProgress();
  touchSession();
}
