# Voice AI Agent Optimizer — Technical Guide

A complete explanation of how the app works: user flow, system architecture, the five-step AI pipeline, and the logic behind each stage.

**Related docs:**
- [UI_GUIDE.md](UI_GUIDE.md) — every button and tab in the UI
- [MARKETPLACE.md](MARKETPLACE.md) — GHL Marketplace embed and deploy
- [README.md](README.md) — quick start
- `Modifications.md` — original build spec (local only, gitignored)
- `fixtures/schemas/` — JSON schemas for pipeline artifacts

---

## 1. What this app does

The **Voice AI Agent Optimizer** is an internal analysis tool. It does **not** talk to customers. It takes:

1. A **voice agent configuration** (goal + prompt/script)
2. A batch of **historical call transcripts**

…and produces:

| Output | Purpose |
|--------|---------|
| Per-call analysis | Did each call achieve the agent's goal? What failed? |
| Recurring patterns | Which failures show up across multiple calls? |
| Test cases | Scenarios to re-test after fixing the agent |
| Recommendations | Concrete before/after prompt changes |
| Optimized prompt | Full merged prompt ready to copy into the voice agent |

The product loop is:

```
Upload transcripts → Analyze → Review failures → Copy optimized prompt
→ Test live agent manually → Re-upload new transcripts → Re-analyze
```

There is **no automated test execution** against a live voice agent. The Evaluation tab provides a validation checklist; the user tests in their voice platform (e.g. GHL Voice AI) and re-uploads results.

---

## 2. System architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser (Vue 3 + Vite + Tailwind)                              │
│  Tabs: Home | Analysis | Test Cases | Evaluation                │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTP /api/*
┌───────────────────────────▼─────────────────────────────────────┐
│  Express backend (Node.js, port 3001)                           │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────────┐ │
│  │ Registries  │  │ In-memory    │  │ Pipeline orchestrator   │ │
│  │ agent +     │  │ store.js     │  │ pipeline.js             │ │
│  │ transcripts │  │ (session)    │  │                         │ │
│  └─────────────┘  └──────────────┘  └───────────┬─────────────┘ │
│                                                  │               │
│  ┌───────────────────────────────────────────────▼─────────────┐ │
│  │ LLM provider (OpenAI or Ollama) → JSON responses            │ │
│  └─────────────────────────────────────────────────────────────┘ │
│  ┌──────────────────┐  ┌──────────────────────────────────────┐│
│  │ analysis_cache/  │  │ run_logs/ (per-run step artifacts)     ││
│  └──────────────────┘  └──────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### Stack

| Layer | Technology |
|-------|------------|
| Frontend | Vue 3, Vite, Tailwind CSS 4 |
| Backend | Express 4 (ES modules) |
| AI | OpenAI (`gpt-4o-mini`) or local Ollama (`qwen3:8b`) |
| Session state | In-memory (`store.js`) — resets on server restart |
| Persistence | Analysis cache + run logs on disk (optional) |

### Key directories

| Path | Role |
|------|------|
| `frontend/src/App.vue` | Entire SPA UI |
| `frontend/src/api.js` | API client |
| `backend/src/index.js` | Express routes |
| `backend/src/services/pipeline.js` | Pipeline orchestrator |
| `backend/src/llm/prompts.js` | All LLM prompt templates |
| `backend/src/llm/provider.js` | OpenAI / Ollama abstraction |
| `backend/src/agentRegistry.js` | Agent config normalization |
| `backend/src/transcriptRegistry.js` | Transcript upload + storage |
| `backend/src/transcriptParse.js` | Flexible JSON ingestion |
| `fixtures/` | Sample HVAC agent + 12 demo transcripts |

---

## 3. User flow (end to end)

### Home tab — inputs only, no AI

1. **Agent config** — user enters name, goal, prompt, and optional call script, or loads the sample HVAC agent.
2. **Transcripts** — user uploads one or more `.json` files (or pastes JSON). Each file is one call with `turns` (speaker + text).
3. **Analyze** — triggers `POST /api/run/full`.

While the pipeline runs, the UI polls `GET /api/pipeline/progress` and shows a progress bar. Partial per-call results appear in the Analysis tab as each transcript completes.

### Analysis tab — results of steps 1–3

- **Executive summary** — goal achievement rate (% of calls where `goal_achieved: true`)
- **Recurring failures / strengths** — from pattern detection (step 3)
- **Per-call drill-down** — task completion, strengths, failures, objections for each call

### Test Cases tab — results of step 4

Scenarios derived from recurring failures. Each test case has:
- Persona, scenario description
- `failure_target` (which pattern it tests)
- Expected behavior and success criteria

These are **plans for manual testing**, not automated runs.

### Evaluation tab — results of step 5

- **Optimized prompt** — full agent prompt with recommendations merged in
- **Before/after recommendations** — each change tied to a specific failure pattern
- **GHL validation checklist** — steps to test live and re-upload transcripts

---

## 4. Input data

### Agent config

Normalized by `agentRegistry.js` from many possible JSON shapes:

```json
{
  "agentId": "custom_agent",
  "name": "My Voice Agent",
  "goal": "Book appointments for qualified homeowners",
  "prompt": "You are Alex, a friendly assistant...",
  "model": "unknown",
  "temperature": 0.7,
  "tools": [],
  "knowledgeBase": [],
  "guardrails": { "escalationTriggers": [], "prohibitedClaims": [] }
}
```

Accepted field aliases: `system_prompt`, `systemPrompt`, `instructions`, `objective`, `agent_id`, etc.

If the prompt contains `--- CALL SCRIPT / FLOW ---`, everything after that marker is extracted as `_script` and included in goal extraction.

### Transcripts

Normalized by `transcriptParse.js` to:

```json
{
  "callId": "call_001",
  "turns": [
    { "speaker": "agent", "text": "Hello, thanks for calling..." },
    { "speaker": "caller", "text": "Hi, I need an inspection." }
  ]
}
```

Flexible ingestion supports:
- Wrapper keys: `transcripts`, `calls`, `conversations`, `data`, etc.
- Turn keys: `turns`, `messages`, `dialogue`, `utterances`, etc.
- Speaker aliases: `agent`/`assistant`/`bot` vs `caller`/`user`/`customer`

Optional metadata (`locationId`, `contactId`, `agentId`) is preserved but not required.

---

## 5. The AI pipeline (five steps)

Triggered by `runFullPipeline()` in `pipeline.js`. Each step calls the LLM via `llmJson()` and stores results in `store.js`.

```
Agent config + Transcripts
         │
         ▼
┌────────────────────┐
│ 1. Goal Extraction │  ← derives evaluation criteria from prompt
└─────────┬──────────┘
          ▼
┌────────────────────┐
│ 2. Transcript      │  ← one LLM call per call (parallel for OpenAI)
│    Analysis        │
└─────────┬──────────┘
          ▼
┌────────────────────┐
│ 3. Pattern         │  ← aggregates failures across all calls
│    Detection       │
└─────────┬──────────┘
          ├──────────────────┐
          ▼                  ▼
┌─────────────────┐  ┌──────────────────────┐
│ 4. Test Case    │  │ 5. Recommendations   │
│    Generation   │  │    + Optimized Prompt │
└─────────────────┘  └──────────────────────┘
```

Progress is tracked as `4 + N` steps (4 pipeline stages + N transcripts). The UI percent updates after each transcript finishes.

---

### Step 1 — Goal extraction

**File:** `goalExtraction.js`  
**Purpose:** Convert the agent's natural-language prompt into **measurable evaluation criteria** so every later step scores calls consistently.

**LLM input:**
- `agent_goal`, `agent_prompt` (truncated to 1800 chars), `agent_script` (800 chars)

**LLM output:**
```json
{
  "required_tasks": ["collect_contact_info", "book_appointment"],
  "expected_behaviors": ["polite_tone", "handle_objections"]
}
```

Rules in prompt: 3–8 items each, snake_case, derived from the agent config only.

**Post-processing:** Stored as `evaluationCriteria` with `_input` echoing what was sent.

**Why it matters:** The same transcript can be judged differently depending on criteria. Step 1 locks the rubric before per-call analysis begins. Different LLM providers may extract slightly different task names (e.g. `collect_contact_information` vs `collect_contact_info`) — this is expected.

---

### Step 2 — Transcript analysis

**File:** `transcriptAnalyzer.js`  
**Purpose:** For **each call**, determine whether the agent achieved its goal and what went right or wrong.

**Pre-processing (`transcriptTrim.js`):**
- Remove filler turns ("okay", "uh-huh", "thanks", etc.)
- Cap transcript at 3,000 characters for the LLM
- Format as `agent: ...\ncaller: ...`

**LLM input per call:**
- Agent goal (200 chars)
- `required_tasks` and `expected_behaviors` from step 1
- Formatted transcript

**LLM output per call:**
```json
{
  "call_id": "call_003",
  "goal_achieved": false,
  "task_completion": {
    "collect_contact_info": false,
    "book_appointment": false
  },
  "objections": [{ "type": "price", "handled": true }],
  "strengths": ["friendly tone", "clear explanation"],
  "failures": ["failed to collect contact info", "no booking made"]
}
```

**Post-processing:**
- `normalizeAnalysis()` — caps strengths at 3, failures at 5, fills missing task keys as `false`
- `normalizeObjections()` — filters empty/placeholder objection types
- Results streamed to UI via `onProgress` callback as each call completes

**Caching (`analysisCache.js`):**
- Disk cache keyed by hash of `(turns + callId + criteria tasks/behaviors)`
- **Does not include LLM provider** — clear cache when comparing OpenAI vs Ollama
- Controlled by `ANALYSIS_CACHE=true|false`

**Concurrency:**
- OpenAI default: 4 parallel calls (`TRANSCRIPT_CONCURRENCY`)
- Ollama default: 1 at a time (local GPU memory)

---

### Step 3 — Pattern detection

**File:** `patternDetection.js`  
**Purpose:** Find **recurring** failures and strengths across the batch, not just per-call noise.

**LLM input:** Compact summary of all analyses (no raw transcripts):
```json
[
  { "id": "call_003", "ok": false, "fail": ["failed to collect contact info"], "str": ["friendly tone"] }
]
```

**LLM output:**
```json
{
  "recurring_failures": [
    { "issue": "Did not collect contact information", "frequency": 5, "severity": "High" }
  ],
  "recurring_strengths": [
    { "issue": "Polite tone", "frequency": 5 }
  ]
}
```

**Post-processing (`enrichPatterns()`):**
- Maps each failure issue back to `affected_calls` by fuzzy text matching against per-call failures
- Adds `business_impact` default
- Builds `missed_opportunities` list
- Computes `executiveSummary.goal_achievement_rate` deterministically (not from LLM)

---

### Step 4 — Test case generation

**File:** `tests.js`  
**Purpose:** Turn recurring failures into **actionable test scenarios** for manual re-testing after prompt changes.

**LLM input:**
- Agent goal
- Recurring failures (issue, frequency, severity)

**LLM output:**
```json
{
  "testCases": [
    {
      "id": "TC001",
      "persona": "Homeowner",
      "scenario": "Caller does not provide contact information",
      "failure_target": "Did not collect contact information",
      "expected_behavior": ["Request contact info", "Confirm homeowner status"],
      "success_criteria": ["Contact info collected", "Appointment booked"]
    }
  ]
}
```

Rules: 3–5 tests, derived from failures only, short fields.

**Post-processing:** Normalizes field names, assigns IDs, wraps in `{ agentId, generatedAt, testCases }`.

---

### Step 5 — Recommendations + optimized prompt

**Files:** `recommend.js`, `recommendNormalize.js`, `applyRecommendations.js`

**Purpose:** Produce concrete, copy-pasteable prompt fixes tied to observed failures.

#### 5a. LLM recommendation generation

**LLM input:**
- Full agent prompt (2500 chars)
- Agent goal, model, temperature, tool IDs
- Recurring failures
- Generated test cases

**LLM output:**
```json
{
  "recommendations": [
    {
      "id": "rec_1",
      "priority": "High",
      "category": "Prompt",
      "issue": "Did not collect contact information",
      "before": "3. If qualified, collect name, phone, email, and service address.",
      "after": "3. If qualified, actively request and confirm the caller's full name, phone number, email, and service address.",
      "reason": "Occurred 5 times in call_003, call_004, call_009",
      "expected_impact": "Higher contact collection rate"
    }
  ]
}
```

Prompt rules enforced on the LLM:
- `before` must be a **verbatim excerpt** from the agent prompt
- `after` must be the **replacement text**, not meta-instructions like "add explicit instruction to..."
- Categories: Prompt, Temperature, Tools, Knowledge Base, Escalation

#### 5b. Recommendation normalization (`recommendNormalize.js`)

The LLM often returns imperfect before/after pairs. This layer fixes them:

| Problem | Fix |
|---------|-----|
| Generic `before` ("Current agent instructions") | Find best matching prompt section by keyword scoring |
| `before` not in prompt | Search prompt lines/sections by issue topic |
| `before`/`after` from different sections | Re-align using header matching |
| Generic `after` | Build deterministic `after` from issue type (contact, booking, escalation, etc.) |
| Duplicate recommendations | Dedupe by `before::after` key |

Recommendations that can't be anchored to real prompt text are **dropped**.

#### 5c. Optimized prompt merge (`applyRecommendations.js`)

Deterministic string merge (no LLM):

1. For each **Prompt** recommendation: `prompt.replace(before, after)` if `before` exists in prompt; otherwise append `after`
2. For **Temperature**: parse `after` as float
3. For **Escalation / Tools / Knowledge Base**: append labeled blocks to prompt

Output: `optimizedAgent` — same structure as input agent with updated `prompt` and `temperature`.

---

## 6. LLM provider layer

**File:** `provider.js`

| Setting | OpenAI | Ollama |
|---------|--------|--------|
| Env | `LLM_PROVIDER=openai`, `OPENAI_API_KEY`, `OPENAI_MODEL` | `LLM_PROVIDER=ollama`, `OLLAMA_MODEL`, `OLLAMA_BASE_URL` |
| JSON mode | `response_format: { type: 'json_object' }` | Prompt asks for JSON only |
| Temperature | 0.1 | Configurable (`OLLAMA_THINK`, `OLLAMA_MAX_TOKENS`) |
| Concurrency | 4 transcripts | 1 transcript |
| Retry | On JSON parse error, retry with 1.5× max tokens | Same |

**Token limits per step** (`LLM_STEP_MAX_TOKENS`):

| Step | Max output tokens |
|------|-------------------|
| Goals | 256 |
| Transcript | 500 |
| Patterns | 320 |
| Tests | 500 |
| Recommendations | 900 |

**Metrics (`llmMetrics.js`):** Every LLM call logs stage, duration, token counts, and cache hits to the terminal as `[llm-metrics]`. Summary included in pipeline response and run logs.

---

## 7. Run logging

**File:** `runLogger.js`  
**Enabled by:** `RUN_LOGS=true` (default)

Each Analyze run creates a timestamped folder:

```
backend/run_logs/2026-06-11T10-12-46_openai/
  manifest.json           # metadata, step timings, LLM summary
  01_goals.json
  02_analyses.json
  analyses/call_001.json  # per-call, written as each completes
  03_patterns.json
  04_test_cases.json
  05_recommendations.json
  06_optimized_agent.json
  llm_metrics.json
```

Use these folders to compare OpenAI vs Ollama runs side by side.

---

## 8. API reference

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Status, provider, transcript count |
| GET/POST | `/api/agent` | Read or set agent config |
| POST | `/api/agent/use-sample` | Load HVAC demo agent |
| GET | `/api/transcripts` | List loaded calls |
| POST | `/api/transcripts/upload` | Upload JSON transcripts |
| POST | `/api/run/full` | **Run full 5-step pipeline** |
| GET | `/api/state` | All pipeline results |
| GET | `/api/pipeline/progress` | Progress while running |
| POST | `/api/reset` | Clear pipeline results |

---

## 9. Session and state behavior

All pipeline results live in **in-memory** `store.js`:

- Survives tab switches within the same server session
- **Lost on server restart**
- Cleared when user uploads new transcripts or changes agent config (`resetState()`)

`pipelineProgress` tracks: `running`, `step`, `detail`, `current`, `total`, `percent`.

---

## 10. What is AI vs deterministic

| Component | AI-generated | Deterministic |
|-----------|-------------|---------------|
| Evaluation criteria (tasks/behaviors) | Yes | — |
| Per-call strengths/failures/goal_achieved | Yes | Caps, task key fill |
| Recurring patterns (issue labels) | Yes | `affected_calls`, executive summary % |
| Test cases | Yes | ID assignment, wrapping |
| Recommendations (before/after) | Yes | Normalization, dedupe, drop invalid |
| Optimized prompt | — | String merge from recommendations |
| Objection filtering | — | Rule-based |
| Transcript trimming | — | Filler removal, char cap |
| Analysis cache | — | SHA-256 key lookup |

**Important:** Per-call `strengths` and `failures` are **LLM judgments**, not ground-truth labels from the transcript JSON. Fixture files may include `expectedIssues` for QA regression, but those are stripped before analysis and not shown to the LLM.

---

## 11. Domain agnosticism

The optimizer is **not HVAC-specific**. The sample fixtures use Summit HVAC, but:

- Goal extraction derives criteria from whatever prompt you provide
- Transcript parser accepts any JSON shape with turns
- Prompts never hardcode industry terms

Works for dental, real estate, support, or any voice agent domain.

---

## 12. Deployment modes

| Mode | How | Notes |
|------|-----|-------|
| **Local dev** | `npm run dev` — Vite (5173) + Express (3001) | Default; Ollama or OpenAI |
| **Production single-server** | `npm run build && npm start` | Express serves `frontend/dist` + API |
| **Docker** | `docker compose up --build` | See [MARKETPLACE.md](MARKETPLACE.md) |
| **GHL Marketplace** | Custom Menu iframe embed | No API integration; manual upload + copy prompt |

---

## 13. Typical timing (12 transcripts)

| Provider | Approximate total |
|----------|-------------------|
| OpenAI (`gpt-4o-mini`, concurrency 4) | ~35–70s |
| Ollama (`qwen3:8b`, concurrency 1) | ~2–4 min |

Bottleneck is step 2 (one LLM call per transcript) and step 5 (large prompt context).

---

## 14. Failure modes and recovery

| Symptom | Cause | Fix |
|---------|-------|-----|
| "AI did not return any test cases" | LLM returned empty/malformed JSON | Re-run Analyze; try OpenAI |
| "No actionable recommendations" | All recs failed normalization (generic before/after) | Re-run; ensure agent prompt has clear sections |
| Stale results after provider switch | Analysis cache from other provider | Set `ANALYSIS_CACHE=false` or clear `backend/analysis_cache/` |
| Progress stuck | Long Ollama inference | Wait; check terminal `[llm-metrics]` |
| State lost | Server restarted | Re-upload transcripts and re-analyze |

---

## 15. Mental model

Think of the optimizer as a **QA analyst for voice agents**:

1. **Step 1** asks: "What should this agent be trying to do?" (rubric)
2. **Step 2** asks: "How did each call score against that rubric?" (grading)
3. **Step 3** asks: "What keeps going wrong across calls?" (trends)
4. **Step 4** asks: "What should we re-test after fixing?" (test plan)
5. **Step 5** asks: "What exact prompt changes would fix the trends?" (action items)

The human still owns deployment: copy the optimized prompt, test live, export new transcripts, and run Analyze again to measure improvement.
