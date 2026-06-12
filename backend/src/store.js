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

export function getState() {
  return { ...state };
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
}

export function setAnalyses(analyses) {
  state.analyses = analyses;
  state.lastRunAt = new Date().toISOString();
}

export function setPatterns(patterns) {
  state.patterns = patterns;
}

export function setTestCases(testCases) {
  state.testCases = testCases;
}

export function setRecommendations(recommendations) {
  state.recommendations = recommendations;
}

export function setOptimizedAgent(optimizedAgent) {
  state.optimizedAgent = optimizedAgent;
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
}
