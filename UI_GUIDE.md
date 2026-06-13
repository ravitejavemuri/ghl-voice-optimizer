# Voice AI Agent Optimizer — UI Guide

Reference for the dashboard layout, tabs, and pipeline outputs.

**Related:** [README.md](README.md) · [TECHNICAL_GUIDE.md](TECHNICAL_GUIDE.md)

---

## Layout

Single-page app with a sticky header, four tabs, and a footer status bar.

```
┌─────────────────────────────────────────────────────────┐
│  Header: title + subtitle                               │
│  Tabs: Home | Analysis | Test Cases | Evaluation      │
├─────────────────────────────────────────────────────────┤
│  [Error banner]          (if request failed)            │
│  [Pipeline progress bar] (while analyzing)              │
│  Main content (active tab)                              │
│  Footer: agent, provider, transcript count              │
└─────────────────────────────────────────────────────────┘
```

---

## Navigation tabs

| Tab | Unlocks when |
|-----|--------------|
| **Home** | Always |
| **Analysis** | At least one call has been analyzed |
| **Test Cases** | Test cases have been generated |
| **Evaluation** | Recommendations exist |

After a successful run, the app opens **Evaluation** automatically.

---

## Home tab

Inputs for the pipeline: agent configuration and call transcripts.

### Agent configuration

| Field | Purpose |
|-------|---------|
| **Agent name** | Display label |
| **Goal** | Definition of call success |
| **System prompt** | Agent instructions and policies — primary rubric for analysis |
| **Call script / flow** | Optional qualification and objection-handling script |

**Load sample agent** loads the demo HVAC agent. Agent fields are saved when **Analyze** runs.

### Transcripts

Upload one or more `.json` files, paste JSON, or **Load sample calls (12)**. The backend normalizes flexible JSON shapes (`turns`, `messages`, arrays of calls, etc.).

**Analyze N calls** runs the full five-step pipeline. The progress bar shows step and per-call completion. Partial results appear in **Analysis** as each call finishes.

---

## Analysis tab

Outputs from goal extraction, per-call analysis, and pattern detection.

### Executive summary

| Element | Description |
|---------|-------------|
| **Calls analyzed** | Batch size |
| **Goal achievement** | Percentage of calls where `goal_achieved` is true |
| **Recurring failures** | Cross-call failure patterns with severity and frequency |
| **Recurring strengths** | Behaviors that worked consistently |

### Per-call detail

Select a call to view the transcript and analysis:

| Element | Description |
|---------|-------------|
| **Goal achieved** | Whether the agent met its objective |
| **Task completion** | Per required task — completed or missed |
| **Objections** | Objection type and whether it was handled |
| **Strengths** | What worked on this call |
| **Failures** | What failed on this call |

---

## Test Cases tab

Output from test case generation (pipeline step 4). Each card describes a scenario derived from a recurring failure:

| Field | Description |
|-------|-------------|
| **Persona** | Caller profile |
| **Failure target** | Recurring failure this scenario addresses |
| **Scenario** | Situation description |
| **Expected behavior** | What the agent should do |
| **Success criteria** | Conditions that indicate the scenario passed |

---

## Evaluation tab

Output from recommendations and optimized prompt generation (pipeline step 5).

### Optimized prompt

Full merged agent prompt with recommendations applied. Includes suggested temperature when the pipeline recommends a change.

### Recommended changes

Each recommendation card shows:

| Section | Description |
|---------|-------------|
| **Priority / category** | Severity and change type (Prompt, Temperature, Tools, etc.) |
| **Issue** | Failure pattern addressed |
| **Reason** | Evidence from analyzed calls |
| **Expected impact** | Intended improvement |
| **Before / After** | Verbatim prompt excerpt and proposed replacement |

---

## Badges and colors

| Color | Meaning |
|-------|---------|
| Green | Goal achieved, task completed |
| Red | Goal missed, task missed |
| Amber | Medium severity |
| Blue | Selected item, info |

---

*Pipeline: goal extraction → transcript analysis → pattern detection → test case generation → recommendations*
