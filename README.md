# NEXUS REFACTOR

**Multi-Agent Code Refactoring System** — AI-powered swarm intelligence for autonomous codebase analysis, refactoring, testing, and documentation generation.

Built by **Oke Iyanuoluwa Enoch** | MSc Robotics & Automation, University of Salford

---

## Overview

NEXUS REFACTOR deploys **8 specialized AI agents** in a coordinated swarm formation to analyze, refactor, test, and document codebases autonomously. Each agent is an expert in its domain, and they work in parallel phases to produce comprehensive codebase transformation artifacts.

### Agent Formation

| Agent | Role | Phase |
|-------|------|-------|
| **Architect** | Architecture analysis, dependency mapping, module boundaries, design pattern identification | 1 (Sequential) |
| **Security Auditor** | Vulnerability scanning, CWE classification, secrets detection, SQL injection analysis | 2 (Parallel) |
| **Performance Profiler** | Bottleneck identification, algorithmic complexity, memory profiling, I/O optimization | 2 (Parallel) |
| **Refactoring Engine** | Code restructuring, SOLID principles, pattern implementation, dead code elimination | 3 (Sequential) |
| **Test Generator** | Unit/integration/edge-case test generation, fixture creation, coverage estimation | 4 (Parallel) |
| **Migration Planner** | Framework migration paths, API upgrades, deprecation resolution, modernization roadmap | 4 (Parallel) |
| **Documentation Engine** | README, API docs, Mermaid architecture diagrams, inline documentation, changelog | 5 (Parallel) |
| **Quality Gate** | Final review, grading (A+ to F), approval decision, confidence scoring, recommendations | 5 (Parallel) |

### Two Operating Modes

- **Demo Mode** — Runs with pre-computed results from a legacy e-commerce codebase. No API key needed. Demonstrates the full swarm pipeline instantly.
- **Live Mode** — Connects to Claude (Anthropic) or GPT-4o (OpenAI) APIs to analyze your actual code in real-time. Requires an API key.

## Features

- **Multi-Provider AI Support** — Choose between Claude Sonnet 4 (Anthropic) or GPT-4o (OpenAI)
- **Server-Side API Proxy** — API keys are sent through Next.js API routes, never exposed client-side
- **File Upload or Paste** — Upload source files (.py, .js, .ts, .java, .go, .rs, .rb, .cpp, .php) or paste code directly
- **Configurable Swarm** — Toggle individual agents, set analysis depth (Quick/Thorough/Exhaustive), focus area (Balanced/Security/Performance/Maintainability)
- **Custom Instructions** — Inject specific requirements into every agent's context
- **Target Framework** — Tell agents what you're migrating toward (FastAPI, Spring Boot, etc.)
- **Real-Time Metrics** — Cyclomatic complexity, maintainability index, coupling, cohesion, tech debt, test coverage
- **Before/After Comparison** — Visual comparison of code quality metrics pre- and post-refactoring
- **Token Tracking** — Live count of API tokens consumed during analysis
- **Comprehensive Output** — Refactored code, test suites, documentation, architecture diagrams, migration plans, security reports

## Tech Stack

- **Frontend**: Next.js 14, React 18
- **AI Providers**: Anthropic Claude API, OpenAI API
- **Deployment**: Vercel
- **Styling**: CSS-in-JS with IBM Plex Mono/Sans typography

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- (Optional) Anthropic API key or OpenAI API key for Live mode

### Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/nexus-refactor.git
cd nexus-refactor

# Install dependencies
npm install

# Copy environment template
cp .env.example .env.local

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Environment Variables (Optional)

For server-side API proxy support, add keys to `.env.local`:

```env
ANTHROPIC_API_KEY=sk-ant-api03-...
OPENAI_API_KEY=sk-proj-...
```

These are optional — in Live mode, users provide their own API key through the UI.

## Deploy to Vercel

### One-Click Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/YOUR_USERNAME/nexus-refactor)

### Manual Deploy

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Production deploy
vercel --prod
```

### Vercel Environment Variables

After deploying, add optional environment variables in Vercel Dashboard > Settings > Environment Variables:

- `ANTHROPIC_API_KEY` — For server-side Claude API calls
- `OPENAI_API_KEY` — For server-side OpenAI API calls

## Project Structure

```
nexus-refactor/
├── public/                  # Static assets
├── src/
│   ├── lib/
│   │   ├── agents.js        # Agent definitions & prompt templates
│   │   ├── ai-provider.js   # AI provider abstraction (Claude + OpenAI)
│   │   └── demo-data.js     # Pre-computed demo results
│   ├── pages/
│   │   ├── api/
│   │   │   ├── anthropic.js  # Server-side Anthropic API proxy
│   │   │   └── openai.js     # Server-side OpenAI API proxy
│   │   ├── _app.js           # App wrapper
│   │   ├── _document.js      # HTML document with SEO meta tags
│   │   └── index.js          # Main application page
│   └── styles/
│       └── globals.css        # Global styles & CSS variables
├── .env.example              # Environment variable template
├── .gitignore
├── next.config.js            # Next.js configuration
├── package.json
├── vercel.json               # Vercel deployment configuration
└── README.md
```

## Architecture

The system uses a **phased parallel execution model** inspired by RuFlo's swarm orchestration patterns:

```
Phase 1 (Sequential):  Architect → baseline metrics + issues
Phase 2 (Parallel):    Security Auditor + Performance Profiler
Phase 3 (Sequential):  Refactoring Engine (uses Phase 1+2 findings)
Phase 4 (Parallel):    Test Generator + Migration Planner
Phase 5 (Parallel):    Documentation Engine + Quality Gate (final review)
```

Each agent receives:
- The source code (up to 6000 chars)
- Project context (name, language, focus area)
- Findings from previous phases (issues, patterns, metrics)
- Custom instructions from the user

## Attribution

- **Author**: Oke Iyanuoluwa Enoch — Independent Robotics Engineer
- **Affiliation**: MSc Robotics & Automation, University of Salford, Manchester, UK
- **Inspired by**: [RuFlo](https://github.com/ruvnet/ruflo) multi-agent orchestration patterns

## License

MIT License — see [LICENSE](LICENSE) for details.
