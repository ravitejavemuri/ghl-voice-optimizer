# Voice AI Agent Optimizer — UI Guide

Complete reference for every screen, tab, button, field, badge, and status message in the web app.

**App URL (local):** http://localhost:5173  
**Related:** [README.md](README.md) · [TECHNICAL_GUIDE.md](TECHNICAL_GUIDE.md)

---

## Table of contents

1. [Overall layout](#overall-layout)
2. [Global messages & progress](#global-messages--progress)
3. [Navigation tabs](#navigation-tabs)
4. [Home tab](#home-tab)
5. [Analysis tab](#analysis-tab)
6. [Test Cases tab](#test-cases-tab)
7. [Evaluation tab](#evaluation-tab)
8. [Badges, colors & scores](#badges-colors--scores)
9. [Typical workflow](#typical-workflow)
10. [Refresh & session behavior](#refresh--session-behavior)

---

## Overall layout

The app is a single-page interface with a **sticky header** and **four tabs**. Only one tab’s content is visible at a time.

```
┌─────────────────────────────────────────────────────────┐
│  Header: title + subtitle                               │
│  Tabs: Home | Analysis | Test Cases | Evaluation      │
├─────────────────────────────────────────────────────────┤
│  [Error banner]          (if something failed)        │
│  [Session notice]        (amber — refresh / reconnect)  │
│  [Pipeline progress bar] (blue — while analyzing)       │
│                                                         │
│  Main content (active tab)                              │
│                                                         │
│  Footer: dev mode + agent model info                    │
└─────────────────────────────────────────────────────────┘
```

### Header

| Element | Meaning |
|---------|---------|
| **AI** icon (blue square) | Visual branding only. |
| **Voice AI Agent Optimizer** | App title. |
| **Subtitle** — *Upload past calls · find flaws · generate tests · optimize* | One-line description of the product goal. |

### Footer

| Element | Meaning |
|---------|---------|
| **Local dev mode** | Running locally, not embedded in GoHighLevel yet. |
| **GHL embed coming later** | Marketplace / iframe integration is not built in this build. |
| **Agent: {model} @ temp {temperature}** | The agent config currently loaded on the server (from your fields or sample agent). Informational only. |

---

## Global messages & progress

These appear **above** the tab content and apply to any tab.

### Error banner (red)

- **When:** Upload failed, JSON invalid, analyze failed, API error, validation (missing agent or transcripts).
- **What to do:** Read the message, fix the issue (e.g. add prompt, upload `.json` files), try again.
- **Clears:** On the next successful action that resets `error`.

### Session notice (amber)

- **When:** You refreshed during a run, a previous run was interrupted, or transcripts are loaded and waiting for Analyze.
- **Examples:**
  - *"Analysis is still running — progress will update below."*
  - *"Previous run was interrupted. 5 transcript(s) still loaded — click Analyze to run again."*
  - *"5 transcript(s) loaded — click Analyze when ready."*
- **Hidden while** the pipeline progress bar is active (`pipelineRunning`).

### Pipeline progress (blue)

- **When:** You clicked **Analyze** and the full pipeline is running.
- **Percent** — rough completion (analyze + aggregate + tests + recommend).
- **Detail line** — current step, e.g. `Analyzed call_003 (3/5, llm_brief)…` or `Generating test cases…`.
- **Note:** *Keep this tab open. Partial results appear in Analysis as each call completes.*
- **You can switch to Analysis** during the run; completed calls show up incrementally.

### Upload success message (green, Home tab)

- **When:** Files uploaded, samples loaded, agent saved, script file loaded.
- **Examples:** *"Loaded 5 call(s) — 5 total ready to analyze"*, *"Loaded sample HVAC agent config"*.

---

## Navigation tabs

Four tabs in the header. Click to switch. **Switching tabs scrolls to the top.**

| Tab | Icon | When enabled | When locked (greyed out) |
|-----|------|--------------|---------------------------|
| **Home** | ⌂ | Always | Never |
| **Analysis** | ◈ | After at least one call has been analyzed | Before first analyze completes |
| **Test Cases** | ◎ | After test cases are generated | Before pipeline reaches test step |
| **Evaluation** | ✦ | After recommendations exist | Before pipeline completes |

- **Blue dot** on a tab = that tab has data ready and is unlocked.
- **Disabled tabs** cannot be clicked until their prerequisite data exists.
- After a **successful** full Analyze, the app usually opens **Evaluation** automatically.

---

## Home tab

Setup screen: load transcripts, configure the voice agent, run the pipeline.

### Intro card — *Optimize your Voice AI agent*

| Element | Meaning |
|---------|---------|
| **Step 1** — Upload past calls (JSON) | Load one or many call transcript files. |
| **Step 2** — Analysis — patterns & failures | Per-call evaluation and cross-call patterns (Analysis tab). |
| **Step 3** — Test cases from patterns | Scenarios generated from recurring failures (Test Cases tab). |
| **Step 4** — Evaluation — fixes for GHL | Prompt recommendations and GHL validation plan (Evaluation tab). |

### Past call transcripts panel

Primary upload area for call data.

#### Badge: `N calls loaded` (top right)

- Count of transcripts currently on the server, ready to analyze.
- Updates after upload, sample load, clear, or paste-on-analyze.

#### File drop zone (dashed border)

| State | Appearance | Behavior |
|-------|------------|----------|
| **Empty batch** | *Drop call transcript JSON files here* | Click or drag `.json` files. |
| **Has calls** | *Add more call transcripts* | **Appends** new files to the existing batch (does not replace). |
| **Paste active** | Greyed out, not clickable | You must clear pasted JSON before uploading files. |
| **Dragging** | Blue highlight | Drop to upload. |

**Accepted format:** `.json` only. Multiple files allowed. Each file can be one call or a combined structure; the backend normalizes flexible JSON shapes (`turns`, `messages`, arrays of calls, etc.).

**Mutual exclusion with paste:** If the paste textarea has content, file upload is disabled (and vice versa).

#### Loaded calls list

Shown when at least one transcript is loaded.

| Column / field | Meaning |
|----------------|---------|
| **callId** | Unique ID for the call (from JSON or auto-generated). |
| **Summary** | Short description from the transcript file, if present. |
| **N turns** | Number of dialogue turns in that call. |

##### Button: **Load sample calls (12)**

- Loads all 12 HVAC demo transcripts from project fixtures.
- **Replaces** the current batch (does not append).
- Clears any pasted JSON.
- Also shown as a standalone button when no calls are loaded yet.
- Replaces the current batch (does not append).

##### Button: **Clear all**

- Removes every loaded transcript from the server.
- Clears pipeline results (analyses, tests, recommendations).
- Does not clear agent config fields.

#### Expandable: **Or paste a single JSON array of calls**

| Element | Meaning |
|---------|---------|
| **Textarea** | Paste raw JSON (single call, array of calls, or wrapper object). |
| **Disabled when** | File upload batch is active — message: *File upload active — paste is disabled.* |
| **Placeholder** | Example shape `{ "turns": [{ "speaker": "agent", "text": "..." }] }` |
| **When it uploads** | On **Analyze** click (not a separate button). Parsed and sent to the server immediately before the pipeline runs. |
| **After paste analyze** | Textarea is cleared once upload succeeds. |

---

### Voice agent config panel

Defines what the AI compares each call **against**. Required before Analyze.

| Field | Required? | Purpose |
|-------|-----------|---------|
| **Agent name** | Optional (defaults to "Voice AI Agent") | Display label; saved with config. |
| **Goal** | One of goal / prompt / script required | What success means on a call (e.g. book appointment, collect lead). |
| **System prompt** | ↑ | Full agent instructions, policies, tone — primary rubric for analysis. |
| **Call script / flow** | Optional | Objection handling, qualification steps, closing script. Merged into saved prompt under `--- CALL SCRIPT / FLOW ---`. |

#### Button: **Upload script file**

- Opens file picker for `.txt`, `.md`, `.json`, or other text.
- Fills **Call script / flow** textarea (does not auto-save to server until Analyze).

#### Button: **Load sample agent**

- Loads the demo **Summit Home Services HVAC** agent (goal, prompt, tools context).
- Replaces current agent on server; clears previous pipeline results.

**Note:** There is no separate “Save agent” button. Agent fields are **saved automatically** when you click **Analyze**.

---

### Button: **Analyze** / **Analyze N calls**

Main action. Runs the **full 5-step pipeline** in one go:

1. Save agent config  
2. Upload pasted JSON (if any)  
3. Extract evaluation criteria (goal extraction)  
4. Analyze every loaded call in parallel  
5. Detect recurring failure patterns  
6. Generate test cases from patterns  
7. Generate recommendations + optimized prompt  

| Button label | Meaning |
|--------------|---------|
| **Analyze** | No transcripts loaded yet (button disabled). |
| **Analyze N calls** | Ready; N = loaded transcript count. |
| **Saving…** | Saving agent before pipeline (brief). |
| **Analyzing N calls…** | Pipeline running (also see progress bar). |

**Disabled when (`canAnalyze` false):**

- No agent prompt, goal, or script text  
- No files and no pasted JSON  
- Already loading or pipeline running  

**After success:** Usually navigates to **Evaluation** tab; first recommendation auto-selected.

---

## Analysis tab

Per-call results and cross-call summary. Unlocks after analyze step produces `analyses`.

### Empty state

*Complete setup on **Home** and click **Analyze**.* — No analyses in state yet.

### Executive summary card

| Element | Meaning |
|---------|---------|
| **Calls analyzed** | Number of calls in the batch. |
| **Goal achievement** | % of calls where `goal_achieved` was true. |
| **Recurring failures** | Cross-call patterns: severity, frequency, business impact. |
| **Recurring strengths** | What worked consistently across calls. |

### Calls list (left column)

Clickable rows — one per **loaded** transcript.

| Element | Meaning |
|---------|---------|
| **callId** | Call identifier. |
| **Goal badge** | **Goal met** (green) or **Goal missed** (red). |
| **Summary line** | Truncated call summary from transcript metadata. |
| **Blue highlight** | Currently selected call. |

**Click behavior:** Loads full turn-by-turn transcript in the right column, loads analysis detail below, stays on Analysis tab.

### Transcript panel (right column)

- Shown after you **click a call** in the list.
- **Agent turns** — blue bubble, left-aligned block.  
- **Caller turns** — grey bubble, indented right.  
- Scrollable; max height capped.

### Per-call analysis detail (below grid)

Shown when a call is selected.

| Element | Meaning |
|---------|---------|
| **call_id** | Selected call. |
| **Goal achieved badge** | Whether the agent met its objective on this call. |
| **Task completion** | Pills per required task — done (green) or missed (red). |
| **Objections** | Type + handled / not handled. |
| **Strengths** | Bullet list of what worked. |
| **Failures** | Bullet list of what failed. |

### Placeholder: *Select a call above…*

Analyses exist but no call selected yet.

---

## Test Cases tab

Generated scenarios to validate your agent **live in GHL** (not simulated in this app). Unlocks after test generation step.

### Empty state

*Generate test cases after running analysis.* — Run full Analyze from Home first.

### Header card

Explains tests are derived from patterns across your analyzed calls; meant for live GHL validation after you apply fixes.

### Each test case card

| Field | Meaning |
|-------|---------|
| **Persona** | Who the simulated caller is (card title). |
| **Failure target badge** | Which recurring failure this test targets. |
| **Scenario** | Situation to role-play on a live call. |
| **Expected behavior** | What the agent should do. |
| **Success criteria** | How to judge pass/fail on the live call. |

**There is no “Run tests” button** in the UI — execution is manual via phone/GHL.

---

## Evaluation tab

Recommendations, optimized prompt, and GHL validation checklist. Unlocks when recommendations exist.

### Empty state

*Run Analyze to generate optimization recommendations and a GHL validation plan.*

### Validate in GHL Voice AI (blue gradient card)

Step-by-step plan for production validation:

1. Copy optimized prompt into GHL agent settings.  
2. Save and publish.  
3. Call agent’s number — role-play each Test Cases scenario.  
4. Check success criteria during live calls.  
5. Export new call logs and **re-run Analyze** here to measure improvement.

### Optimized prompt (apply in GHL)

| Element | Meaning |
|---------|---------|
| **Suggested temperature** | Optional model temperature from recommendations. |
| **Monospace block** | Full merged prompt to paste into GHL (agent prompt + applied recommendation patches). Read-only display; copy manually. |

### Live voice test checklist

Compact list of test scenarios: persona, failure target, scenario text. Same scenarios as Test Cases tab, formatted for use while on a live call.

### Recommended changes (left sidebar)

List of recommendation cards. **Click** to select.

| On each card | Meaning |
|--------------|---------|
| **Priority badge** | `High` or `Medium` (shown as severity color). |
| **Category** | e.g. `Prompt`, `Guardrails`, `Tools`. |
| **Issue** | Truncated problem this change addresses. |
| **Blue highlight** | Selected recommendation. |

### Recommendation detail (right panel)

| Section | Meaning |
|---------|---------|
| **Title** | Category · priority. |
| **Issue** | Problem statement. |
| **Reason** | Full explanation. |
| **Expected impact** | What should improve if you apply the change. |
| **Before** (red border) | Current prompt/text snippet. |
| **After** (green border) | Proposed replacement or addition. |

**Placeholder:** *Select a change to see before/after.* — No recommendation selected.

---

## Badges, colors & scores

### Goal achievement (calls)

| Badge color | Meaning |
|-------------|---------|
| Green | Goal achieved |
| Red | Goal not achieved |

### Issue / priority severity

| Color | Severity |
|-------|----------|
| Red | `High` |
| Amber | `Medium` |
| Blue | `low` / info |

### Task completion pills

| Color | Meaning |
|-------|---------|
| Green | Task completed |
| Red | Task missed |

---

## Typical workflow

```
1. Home → Load sample agent (optional)
2. Home → Upload JSON transcripts OR paste JSON
3. Home → Analyze N calls
5. Wait for progress bar (minutes on local LLM)
6. Analysis → Review executive summary + click each call
7. Test Cases → Read scenarios for live testing
8. Evaluation → Copy optimized prompt → apply in GHL
9. Call agent with test openings → export new logs
10. Home → Upload new transcripts → Analyze again to compare
```

---

## Refresh & session behavior

| Situation | What happens |
|-----------|--------------|
| **Refresh during analyze** | Reconnects to in-progress pipeline; progress bar resumes; partial analyses preserved. |
| **Refresh after complete run** | Stays on results; tabs remain unlocked. |
| **Refresh after interrupted run** | Pipeline state reset; transcripts **kept**; amber notice to click Analyze again. |
| **Upload new transcripts** | Pipeline results cleared; must Analyze again. |
| **Append more JSON files** | Adds to batch; pipeline results cleared. |
| **Load sample agent** | Pipeline results cleared. |

---

## Quick reference — every clickable control

| Control | Tab | Action |
|---------|-----|--------|
| Tab: Home | Header | Go to setup |
| Tab: Analysis | Header | Per-call + summary results |
| Tab: Test Cases | Header | Generated scenarios |
| Tab: Evaluation | Header | Recommendations + optimized prompt |
| Drop zone / file picker | Home | Upload `.json` transcript(s) |
| Load sample calls (12) | Home | Load demo transcript batch |
| Clear all | Home | Remove all transcripts |
| Paste JSON textarea | Home | Paste calls (uploads on Analyze) |
| Upload script file | Home | Load script into optional field |
| Load sample agent | Home | Load demo HVAC agent |
| Analyze N calls | Home | Run full 5-step pipeline |
| Call row in list | Analysis | Select call → transcript + detail |
| Recommendation card | Evaluation | Show before/after detail |

---

*Pipeline: goal extraction → transcript analysis → patterns → tests → recommendations.*
