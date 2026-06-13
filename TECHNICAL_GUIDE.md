# Voice AI Agent Optimizer — Technical Guide

Architecture and behavior of the five-step AI pipeline.

**Related:** [README.md](README.md) · [UI_GUIDE.md](UI_GUIDE.md) · `fixtures/schemas/` — JSON schemas for pipeline artifacts

---

## 1. Overview

The Voice AI Agent Optimizer ingests a **voice agent configuration** (goal + prompt) and a batch of **historical call transcripts**, then produces structured analysis and optimization artifacts:

| Output | Description |
|--------|-------------|
| Evaluation criteria | Required tasks and expected behaviors derived from the agent config |
| Per-call analysis | Goal achievement, task completion, strengths, and failures per call |
| Recurring patterns | Cross-call failure and strength trends |
| Test cases | Scenarios targeting observed failure patterns |
| Recommendations | Before/after prompt changes tied to specific issues |
| Optimized prompt | Merged agent prompt with recommendations applied |

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser (Vue 3 + Vite + Tailwind)                              │
│  Tabs: Home | Analysis | Test Cases | Evaluation                │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTP /api/*
┌───────────────────────────▼─────────────────────────────────────┐
│  Express backend (Node.js)                                        │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────────┐ │
│  │ Registries  │  │ In-memory    │  │ Pipeline orchestrator   │ │
│  │ agent +     │  │ store.js     │  │ pipeline.js             │ │
│  │ transcripts │  │ (session)    │  │                         │ │
│  └─────────────┘  └──────────────┘  └───────────┬─────────────┘ │
│                                                  │               │
│  ┌───────────────────────────────────────────────▼─────────────┐ │
│  │ LLM provider → structured JSON responses                    │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

| Layer | Technology |
|-------|------------|
| Frontend | Vue 3, Vite, Tailwind CSS |
| Backend | Express (ES modules) |
| AI | Configurable LLM provider (`backend/src/llm/provider.js`) |
| Session state | In-memory (`store.js`) |

| Path | Role |
|------|------|
| `frontend/src/App.vue` | Dashboard UI |
| `backend/src/index.js` | API routes |
| `backend/src/services/pipeline.js` | Pipeline orchestrator |
| `backend/src/llm/prompts.js` | LLM prompt templates |
| `backend/src/agentRegistry.js` | Agent config normalization |
| `backend/src/transcriptRegistry.js` | Transcript upload and storage |
| `backend/src/transcriptParse.js` | Flexible JSON ingestion |
| `fixtures/` | Sample agent config and demo transcripts |

---

## 3. Input data

### Agent config

Normalized by `agentRegistry.js`:

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

Field aliases (`system_prompt`, `instructions`, `objective`, etc.) are accepted. Content after `--- CALL SCRIPT / FLOW ---` in the prompt is extracted as call script context for goal extraction.

### Transcripts

Normalized by `transcriptParse.js`:

```json
{
  "callId": "call_001",
  "turns": [
    { "speaker": "agent", "text": "Hello, thanks for calling..." },
    { "speaker": "caller", "text": "Hi, I need an inspection." }
  ]
}
```

Flexible ingestion supports wrapper keys (`transcripts`, `calls`, `messages`, etc.) and speaker aliases (`agent`/`assistant`/`bot`, `caller`/`user`/`customer`). Optional metadata (`locationId`, `contactId`, `agentId`) is preserved when present.

---

## 4. Pipeline

Triggered by `POST /api/run/full` → `runFullPipeline()` in `pipeline.js`. Each step calls the LLM via `llmJson()` and stores results in `store.js`.

```
Agent config + Transcripts
         │
         ▼
┌────────────────────┐
│ 1. Goal Extraction │
└─────────┬──────────┘
          ▼
┌────────────────────┐
│ 2. Transcript      │  ← one LLM call per call
│    Analysis        │
└─────────┬──────────┘
          ▼
┌────────────────────┐
│ 3. Pattern         │
│    Detection       │
└─────────┬──────────┘
          ├──────────────────┐
          ▼                  ▼
┌─────────────────┐  ┌──────────────────────┐
│ 4. Test Case    │  │ 5. Recommendations   │
│    Generation   │  │    + Optimized Prompt │
└─────────────────┘  └──────────────────────┘
```

Progress is tracked as `4 + N` steps (four pipeline stages plus one per transcript). The UI polls `GET /api/pipeline/progress` and surfaces partial per-call results as step 2 completes.

---

### Step 1 — Goal extraction

**File:** `goalExtraction.js`

Derives measurable evaluation criteria from the agent config before per-call scoring begins.

**Input:** `agent_goal`, `agent_prompt`, `agent_script`

**Output:**
```json
{
  "required_tasks": ["collect_contact_info", "book_appointment"],
  "expected_behaviors": ["polite_tone", "handle_objections"]
}
```

Stored as `evaluationCriteria` and used as the rubric for all subsequent analysis.

---

### Step 2 — Transcript analysis

**File:** `transcriptAnalyzer.js`

Evaluates each call against the criteria from step 1.

**Pre-processing (`transcriptTrim.js`):** removes filler turns and caps transcript length for the LLM.

**Output per call:**
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

**Post-processing:** `normalizeAnalysis()` caps list lengths and fills missing task keys; `normalizeObjections()` filters empty entries. Results stream to the UI via an `onProgress` callback.

---

### Step 3 — Pattern detection

**File:** `patternDetection.js`

Aggregates per-call results into cross-call trends.

**Input:** Compact summary of all analyses (no raw transcripts).

**Output:**
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

**Post-processing (`enrichPatterns()`):** maps issues to `affected_calls`, adds business impact, and computes `executiveSummary.goal_achievement_rate` deterministically.

---

### Step 4 — Test case generation

**File:** `tests.js`

Converts recurring failures into structured test scenarios.

**Output:**
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

Post-processing normalizes field names, assigns IDs, and wraps output in `{ agentId, generatedAt, testCases }`.

---

### Step 5 — Recommendations and optimized prompt

**Files:** `recommend.js`, `recommendNormalize.js`, `applyRecommendations.js`

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

`recommendNormalize.js` anchors each recommendation to verbatim prompt text, deduplicates entries, and drops recommendations that cannot be matched to the source prompt.

`applyRecommendations.js` merges **Prompt** changes via string replacement, applies **Temperature** updates, and appends **Escalation / Tools / Knowledge Base** blocks. Output is `optimizedAgent` — the input agent structure with updated `prompt` and `temperature`.

---

## 5. API reference

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Status and provider info |
| GET/POST | `/api/agent` | Read or set agent config |
| POST | `/api/agent/use-sample` | Load demo agent |
| GET | `/api/transcripts` | List loaded calls |
| GET | `/api/transcripts/:id` | Call detail |
| POST | `/api/transcripts/upload` | Upload JSON transcripts |
| POST | `/api/transcripts/use-samples` | Load demo transcripts |
| POST | `/api/transcripts/clear` | Clear loaded transcripts |
| POST | `/api/run/full` | Run full pipeline |
| GET | `/api/state` | Pipeline results |
| GET | `/api/pipeline/progress` | Progress while running |
| POST | `/api/reset` | Clear pipeline results |

---

## 6. Session state

Pipeline results live in in-memory `store.js`. State persists across tab switches within a server session and is cleared when the agent config or transcript batch changes. Server restart resets all state.

---

## 7. AI vs deterministic logic

| Component | AI-generated | Deterministic |
|-----------|-------------|---------------|
| Evaluation criteria | Yes | — |
| Per-call analysis | Yes | Normalization, task key fill |
| Recurring patterns | Yes | `affected_calls`, achievement rate |
| Test cases | Yes | ID assignment, wrapping |
| Recommendations | Yes | Anchoring, dedupe, validation |
| Optimized prompt | — | String merge from recommendations |
| Transcript trimming | — | Filler removal, length cap |

---

## 8. Domain agnosticism

The optimizer is not tied to a specific industry. Goal extraction derives criteria from the provided agent config; the transcript parser accepts any JSON shape with dialogue turns; prompts do not hardcode domain terminology. Sample fixtures use an HVAC agent for demonstration only.
