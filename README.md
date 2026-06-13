# Voice AI Agent Optimizer

Analyze Voice AI transcripts, generate test cases, and recommend agent optimizations.

**Stack:** Node.js (Express) · Vue 3 (Vite) · LLM-backed analysis pipeline

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 18+ |
| npm | 9+ |

## Setup

```bash
git clone https://github.com/<your-username>/voice-ai-optimizer.git
cd voice-ai-optimizer

npm install
npm run install:all

cp backend/.env.example backend/.env
# Configure LLM_PROVIDER and credentials — see backend/.env.example
```

## Run locally

```bash
npm run dev
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:3001/api/health |

On the **Home** tab, load the sample agent and sample calls, then click **Analyze** to run the pipeline. Results appear in **Analysis**, **Test Cases**, and **Evaluation**.

### Production build

```bash
npm run build
npm start
# http://localhost:3001
```

### Docker

```bash
cp backend/.env.example backend/.env
docker compose up --build -d
```

## Documentation

- [TECHNICAL_GUIDE.md](TECHNICAL_GUIDE.md) — architecture and pipeline
- [UI_GUIDE.md](UI_GUIDE.md) — dashboard tabs and controls

## Architecture

```
Home (inputs)
  → Goal Extraction
  → Transcript Analysis
  → Pattern Detection
  → Test Case Generation
  → Recommendations + Optimized Prompt
```

```
fixtures/              Sample transcripts and agent config
backend/src/
  index.js             Express API
  store.js             Session state
  llm/                 Provider abstraction and prompts
  services/            Pipeline stages
frontend/src/
  App.vue              Dashboard UI
```

### API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Status and provider info |
| GET | `/api/agent` | Active agent config |
| POST | `/api/agent` | Set agent config |
| POST | `/api/agent/use-sample` | Load demo agent |
| GET | `/api/transcripts` | List calls |
| GET | `/api/transcripts/:id` | Call detail |
| POST | `/api/transcripts/upload` | Upload JSON transcripts |
| POST | `/api/transcripts/use-samples` | Load demo transcripts |
| POST | `/api/transcripts/clear` | Clear transcripts |
| POST | `/api/run/full` | Run full pipeline |
| GET | `/api/state` | Pipeline results |
| GET | `/api/pipeline/progress` | Progress while running |
| POST | `/api/reset` | Clear pipeline results |

## Deploy to Render

Push to GitHub and connect via [`render.yaml`](render.yaml). Set `OPENAI_API_KEY` in the Render environment. Verify at `https://<your-service>.onrender.com/api/health`.
