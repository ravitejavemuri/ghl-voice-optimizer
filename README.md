# Voice AI Agent Optimizer

Local-first implementation of the HighLevel FSB take-home: analyze Voice AI transcripts, generate test cases, and recommend agent optimizations.

**Stack:** Node.js (Express) backend · Vue 3 (Vite) frontend · Ollama (default) or OpenAI

## Prerequisites

| Tool | Version | Notes |
|------|---------|--------|
| **Node.js** | 18+ (20 recommended) | `node -v` |
| **npm** | 9+ | Comes with Node |
| **Ollama** (default LLM) | 0.6.6+ | [ollama.com](https://ollama.com) — or use OpenAI instead |
| **Python 3** (optional) | 3.9+ | Only for `npm run validate:fixtures` |

## Setup

### 1. Clone and install

```bash
git clone https://github.com/<your-username>/ghl-voice-optimizer.git
cd ghl-voice-optimizer

npm install              # root dev tools (concurrently)
npm run install:all      # backend + frontend dependencies
```

### 2. Configure environment

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` for your LLM provider.

**Option A — Ollama (default, local, no API key)**

```bash
brew install --cask ollama-app   # macOS
open -a Ollama
ollama pull qwen3:8b
```

`backend/.env` (defaults from `.env.example`):

```bash
LLM_PROVIDER=ollama
OLLAMA_MODEL=qwen3:8b
OLLAMA_BASE_URL=http://localhost:11434/v1
```

For higher quality (slower), set `OLLAMA_MODEL=qwen3:14b` and `ollama pull qwen3:14b`.

**Option B — OpenAI (cloud, faster setup)**

```bash
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
TRANSCRIPT_CONCURRENCY=4
```

### 3. Run locally

```bash
npm run dev
```

| Service | URL |
|---------|-----|
| **Frontend** | http://localhost:5173 |
| **Backend API** | http://localhost:3001/api/health |

Confirm the health endpoint returns `"ok": true` and shows your AI provider.

### 4. First run in the UI

1. Open http://localhost:5173
2. **Home** → click **Load sample agent** and **Load sample calls** (12 HVAC transcripts included)
3. Click **Analyze** — runs the full 5-step pipeline (~1–3 min with Ollama 8B, faster with OpenAI)
4. Review tabs: **Analysis** → **Test Cases** → **Evaluation**

You can also paste your own agent prompt and upload transcript JSON files on the Home tab.

### Production build (local)

Serves the Vue app from Express on one port (same as Docker/Render):

```bash
npm run build          # builds frontend/dist
npm start              # backend on PORT (default 3001)
# open http://localhost:3001
```

### Docker (optional)

```bash
cp backend/.env.example backend/.env   # set OPENAI_API_KEY for cloud LLM
docker compose up --build -d
# open http://localhost:3001
```

### Validate fixtures (optional)

```bash
npm run validate:fixtures
```

## Docs

- [UI_GUIDE.md](UI_GUIDE.md) — every button, tab, and field
- [TECHNICAL_GUIDE.md](TECHNICAL_GUIDE.md) — architecture and AI pipeline
- [MARKETPLACE.md](MARKETPLACE.md) — GHL embed and deploy checklist

Sample HVAC data is included for demos; the optimizer itself is **domain-agnostic**.

## Architecture

Five-step LLM pipeline (see [TECHNICAL_GUIDE.md](TECHNICAL_GUIDE.md)):

```
Home (inputs)
  → Goal Extraction
  → Transcript Analysis (parallel per call)
  → Pattern Detection
  → Test Generator
  → Recommendation Engine
```

```
fixtures/          Sample transcripts + agent config
backend/src/
  index.js         Express API
  fixtures.js      Load sample data
  store.js         In-memory session state
  llm/             Provider (ollama | openai) + prompts
  services/        goalExtraction → transcriptAnalyzer → patternDetection → tests → recommend
frontend/src/
  App.vue          Dashboard UI (4 tabs)
```

### API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Status + AI provider mode |
| GET | `/api/agent` | Active agent config |
| GET | `/api/agent/meta` | Agent source (`generic` / `uploaded` / `sample`) |
| POST | `/api/agent` | Set agent from JSON or `{ name, goal, prompt }` |
| POST | `/api/agent/use-generic` | Reset to generic agent |
| POST | `/api/agent/use-sample` | Load HVAC sample agent for demo |
| GET | `/api/transcripts/meta` | Source (samples vs uploaded) + count |
| GET | `/api/transcripts` | List calls |
| GET | `/api/transcripts/:id` | Call detail |
| POST | `/api/transcripts/upload` | Upload JSON transcripts (`append: true` to add to batch) |
| POST | `/api/transcripts/use-samples` | Load all 12 HVAC sample calls |
| POST | `/api/transcripts/clear` | Clear uploaded transcripts |
| POST | `/api/run/full` | Run entire 5-step pipeline |
| GET | `/api/state` | Current optimizer state |
| GET | `/api/pipeline/progress` | Pipeline progress while running |
| POST | `/api/reset` | Clear pipeline results |

## What's local vs GHL production

| Feature | Local MVP | GHL production (later) |
|---------|-----------|------------------------|
| Transcript ingestion | Fixture JSON files | User uploads JSON in embedded app |
| AI pipeline | Ollama or OpenAI | OpenAI |
| Test generation | From recurring failure patterns | OpenAI |
| Test execution | Manual validation plan | User tests voice agent, re-uploads transcripts |
| Recommendations | LLM from patterns + tests (concrete before/after excerpts) | OpenAI |
| Apply config to agent | Copy optimized prompt from UI | Same — manual copy |
| GHL embed | Local dev | Custom Menu iframe on Marketplace |

## Deploy to Render (GitHub auto-deploy)

Push to GitHub → Render rebuilds automatically via [`render.yaml`](render.yaml).

### 1. Create a GitHub repo (this folder as root)

```bash
git add .
git commit -m "Initial commit: Voice AI Agent Optimizer"
gh auth login   # if needed
gh repo create ghl-voice-optimizer --private --source=. --push
```

Use a **public** repo if you plan a public GHL Marketplace listing (`--public` instead of `--private`).

### 2. Connect Render

1. [dashboard.render.com](https://dashboard.render.com) → **New** → **Blueprint**
2. Connect the GitHub repo → Render detects `render.yaml`
3. Apply the blueprint
4. In the service **Environment** tab, set **`OPENAI_API_KEY`** (required — Ollama does not run on Render)
5. Optional: set **`APP_URL`** to your custom domain; otherwise Render’s `RENDER_EXTERNAL_URL` is used

Every push to **`main`** triggers a new deploy (`autoDeployTrigger: commit`).

Verify: `https://<your-service>.onrender.com/api/health`

### 3. GHL Custom Menu URL

```
https://<your-service>.onrender.com/?locationId={{location.id}}
```

See **[MARKETPLACE.md](MARKETPLACE.md)** for the full listing checklist.

### Local Docker (alternative)

```bash
# backend/.env — LLM_PROVIDER=openai + OPENAI_API_KEY for production-like runs
docker compose up --build -d
```

## Demo script (2–5 min)

1. Open **Home** → load sample agent and sample calls
2. Click **Analyze**
3. **Analysis** → executive summary, recurring failures, per-call task completion
4. **Test Cases** → scenarios targeting observed failures
5. **Evaluation** → optimized prompt + before/after recommendations

## Team of one notes

- **Product:** Closed-loop optimizer (analyze → test → recommend) with clear customer workflow
- **Design:** Single dashboard, tabbed navigation, before/after diff view
- **Engineering:** Structured JSON schemas, provider abstraction, fixture-driven dev
- **QA:** Ground-truth `expectedIssues` on fixtures — `python scripts/validate_fixtures.py --summary`

## What goes to GitHub vs stays local

| Committed (reviewers see) | Gitignored (kept on your machine) |
|---------------------------|-----------------------------------|
| Source, `fixtures/transcripts/`, schemas, Docker/Render | `node_modules/`, `dist/`, `.env` |
| README, TECHNICAL_GUIDE, UI_GUIDE, MARKETPLACE | `run_logs/`, `analysis_cache/` |
| | `Modifications.md`, hiring brief PDF, `fixtures/test_transcripts/` |
