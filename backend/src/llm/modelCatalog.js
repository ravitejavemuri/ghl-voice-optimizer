/** GPT-5 reasoning models offered in the UI (top + balanced tiers). */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export const OPENAI_MODEL_CATALOG = [
  {
    id: 'gpt-5.5',
    label: 'GPT-5.5',
    tier: 'top',
    description: 'Best reasoning and recommendations',
  },
  {
    id: 'gpt-5.4',
    label: 'GPT-5.4',
    tier: 'balanced',
    description: 'Strong reasoning, lower cost than GPT-5.5',
  },
  {
    id: 'gpt-5.4-mini',
    label: 'GPT-5.4 mini',
    tier: 'balanced',
    description: 'Fast reasoning at lower cost',
  },
];

const catalogIds = new Set(OPENAI_MODEL_CATALOG.map((m) => m.id));

const SELECTED_MODEL_FILE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../.selected-openai-model'
);

function readPersistedModelId() {
  try {
    const id = fs.readFileSync(SELECTED_MODEL_FILE, 'utf8').trim();
    if (id && catalogIds.has(id)) return id;
  } catch {
    /* no saved selection yet */
  }
  return null;
}

function persistModelId(id) {
  try {
    fs.writeFileSync(SELECTED_MODEL_FILE, `${id}\n`, 'utf8');
  } catch (err) {
    console.warn(`[llm] Could not persist selected model: ${err.message}`);
  }
}

function defaultModelId() {
  const persisted = readPersistedModelId();
  if (persisted) return persisted;

  const fromEnv = process.env.OPENAI_MODEL?.trim();
  if (fromEnv && catalogIds.has(fromEnv)) return fromEnv;
  if (fromEnv && !catalogIds.has(fromEnv)) {
    console.warn(`[llm] OPENAI_MODEL=${fromEnv} is not in the UI catalog; using gpt-5.5`);
  }
  return 'gpt-5.5';
}

let selectedModelId = defaultModelId();

export function getOpenAIModelCatalog() {
  return OPENAI_MODEL_CATALOG;
}

export function getSelectedOpenAIModelId() {
  return selectedModelId;
}

export function getSelectedOpenAIModelMeta() {
  return (
    OPENAI_MODEL_CATALOG.find((m) => m.id === selectedModelId) ?? {
      id: selectedModelId,
      label: selectedModelId,
      tier: 'custom',
      description: '',
    }
  );
}

export function setSelectedOpenAIModelId(modelId) {
  const id = String(modelId ?? '').trim();
  if (!catalogIds.has(id)) {
    throw new Error(`Unknown model: ${modelId}. Choose a model from the catalog.`);
  }
  selectedModelId = id;
  persistModelId(id);
  return getSelectedOpenAIModelMeta();
}

export function listOpenAIModelsForApi() {
  const selected = getSelectedOpenAIModelMeta();
  return {
    provider: 'openai',
    selected: selected.id,
    selectedLabel: selected.label,
    selectedTier: selected.tier,
    models: OPENAI_MODEL_CATALOG.map((m) => ({
      ...m,
      selected: m.id === selected.id,
    })),
    tiers: [
      { id: 'top', label: 'Top' },
      { id: 'balanced', label: 'Balanced' },
    ],
  };
}
