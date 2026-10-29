# B2B Customer Support AI Bot & Enterprise GTM Operations

[![CI](https://github.com/Hellthefox808/AI-ChatbotsB2B-Customer-Support-AI-Bot/actions/workflows/ci.yml/badge.svg)](https://github.com/Hellthefox808/AI-ChatbotsB2B-Customer-Support-AI-Bot/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.5.0-brightgreen.svg)](https://nodejs.org/)
[![React](https://img.shields.io/badge/react-18.2.0-blue.svg)](https://react.dev/)
[![JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com)
[![Tests](https://img.shields.io/badge/tests-321%20passed-success.svg)](backend/tests)

Enterprise-grade AI customer support platform and Go-To-Market (GTM) acceleration suite integrated with corporate documentation, hybrid RAG retrieval, Gemini/OpenAI LLM orchestration, automated SLA ticket triage, prompt injection defense, and an interactive GTM Command Center.

---

## 🏛️ System Architecture

The application follows strict Layered Clean Architecture boundaries:

```
[ Frontend: React 18 + Vite (Sleek Dark Modern Aesthetic) ]
                           │
             REST API calls via JWT Bearer
                           ▼
[ Presentation Layer ] ── src/presentation/
  ├── Express Controllers (auth, chat, ticket, gtm, pipeline)
  ├── Route Mappings (src/presentation/routes.js)
  └── Security Middlewares (JWT auth, RBAC authorization, Threat Model defense)
                           │
                           ▼
[ Service Layer ] ─────── src/service/
  ├── authService.js      (User onboarding, bcrypt hashing, JWT issuance)
  ├── chatService.js      (Multi-turn memory, context chaining, confidence scoring)
  ├── ragEngine.js        (Hybrid TF-IDF & vector retrieval, keyword boosting)
  ├── ticketService.js    (Automated SLA triage Sev 1-4, sentiment detection)
  ├── gtmService.js       (BANT qualification, battlecards, campaigns, MTA attribution)
  └── pipelineService.js  (Document indexing, webhook ingestion, vector rebuild)
                           │
                           ▼
[ Data Layer ] ────────── src/data/
  ├── database.js         (SQLite engine via node:sqlite DatabaseSync, WAL mode)
  ├── gtmRepository.js    (Accounts, Contacts, Opportunities, Suppression, Queue)
  ├── ticketRepository.js (Tickets, SLA deadlines, audit trails)
  └── documentStore.js    (Knowledge base articles and inverted index)
                           │
                           ▼
[ Integration Layer ] ─── src/integration/
  ├── aiService.js        (Gemini API, OpenAI API, and local deterministic RAG fallback)
  └── toolRegistry.js     (Function schemas and executable tooling)
```

---

## 🚀 Key Modules & Capabilities

### 1. Customer Support AI & RAG Engine
- **Hybrid Retrieval**: Combines TF-IDF keyword indexing with semantic relevance scoring for high-precision retrieval across enterprise knowledge bases.
- **Source Grounding**: Every answer is grounded with citation links to authoritative documents.
- **SLA Classification**: Automated triage classifies tickets into `Sev 1` (15-min SLA), `Sev 2` (2-hr SLA), `Sev 3` (8-hr SLA), and `Sev 4` (24-hr SLA).
- **Sentiment Telemetry**: Real-time sentiment analysis flags frustrated or urgent customer interactions for priority routing.

### 2. Threat Model & Prompt Injection Defense
- **Delimiter Bypasses**: Filters attack vectors such as `[INST]`, `<<SYS>>`, `<|im_start|>`, and `<tool_call>`.
- **System Instruction Protection**: Blocks `ignore all previous instructions` and prompt leaking patterns.
- **IDOR Protection**: Strictly validates ticket ownership and agent roles before returning sensitive support records.

### 3. Enterprise GTM Command Center
- **Lead Qualification & ICP Matrix**: Evaluates enterprise accounts using the BANT framework (Budget, Authority, Need, Timeline) with conversion probability meters and next-best actions.
- **Sales Playbooks & Battlecards**: Interactive competitive battlecards with differentiation pillars, trap-setting questions, and objection scripts.
- **Account Intent & Churn Risk**: Real-time signal scanner monitoring CRM activity, support severity, and engagement drop-offs.
- **AI Outreach Synthesizer**: Generates persona-tailored cold outreach for VP, Director, and Architect stakeholders with pain-point hooks.
- **Campaign Engine with Human-in-the-Loop Approval**: Dispatch queue with rate throttling (`batchSize = 50`) and strict administrative approval gates (`APPROVE`).
- **Suppression & Opt-Out Registry**: Enforces domain and email exclusion rules at both lead qualification and queue dispatch stages.
- **CRM Sync & Attribution Engine**: Multi-touch attribution modeling (First-Touch, Last-Touch, Linear) and idempotent CRM sync simulator.

---

## 🛠️ Tech Stack & Requirements

- **Runtime**: Node.js `>= 22.5.0` (required for built-in `node:sqlite` DatabaseSync module)
- **Backend**: Express 4.18, `bcryptjs`, `jsonwebtoken`, `helmet`, `standard`
- **Frontend**: React 18.2, Vite 5.4, Vanilla CSS with custom glassmorphism variables
- **Testing**: Node.js built-in test runner (`node --test`)
- **CI/CD**: GitHub Actions matrix testing on Node.js 22.x and 24.x

---

## ⚡ Quick Start

### 1. Backend Setup

```bash
cd backend
cp .env.example .env    # Configure optional GEMINI_API_KEY / OPENAI_API_KEY
npm install

# Run complete test suite (321 passing tests)
npm test

# Check code style
npm run lint

# Start API server on port 4000
npm start
```

### 2. Frontend Setup

```bash
cd frontend
npm install

# Check code style
npm run lint

# Verify production Vite build
npm run build

# Start local development server (Vite on port 5173)
npm run dev
```

---

## 🧪 Verification Matrix

| Validation Suite | Command | Expected Result |
|---|---|---|
| **Backend Unit & Integration Tests** | `cd backend && npm test` | **321 Pass / 0 Fail** |
| **Backend Code Style** | `cd backend && npm run lint` | **0 Errors** (`standard`) |
| **Frontend Code Style** | `cd frontend && npm run lint` | **0 Errors** (`standard`) |
| **Frontend Production Build** | `cd frontend && npm run build` | **Clean bundle (221 kB)** |

---

## 🔒 Security & Privacy

- **Zero Secret Ingestion**: Real credentials, `.env` files, and database files (`*.db`) are strictly excluded via `.gitignore`.
- **Role-Based Access Control**: Sensitive actions (campaign approvals, mass dispatch, user provisioning) require valid JWT Bearer tokens with administrative privileges.
- **Audit Logging**: Every authentication event, ticket resolution, prompt injection block, and campaign dispatch is recorded with structured JSON telemetry.

---

## 📄 License

MIT License.
