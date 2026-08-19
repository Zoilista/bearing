# Bearing

**Idea validation for indie game developers.**

> Bearing doesn't tell you where to land. It helps you find your direction.

Bearing pulls real game data from SteamSpy and the Steam Store, then uses AI to find comparable games and provide honest market context — based only on real data, never invented titles.

---

## Tech stack

- **Framework**: Next.js 14 (App Router, TypeScript)
- **Styling**: Vanilla CSS with custom brand tokens
- **Database**: MongoDB Atlas (for SteamSpy cache)
- **AI**: Groq (`llama-3.3-70b-versatile`)
- **Data sources**: SteamSpy API + Steam Web API

---

## Local setup

### 1. Prerequisites

- Node.js 18+
- A [MongoDB Atlas](https://www.mongodb.com/atlas) account (free tier M0 is sufficient)
- A [Groq API key](https://console.groq.com/) (free tier available)

### 2. Clone & install

```bash
# Already in the directory:
npm install
```

### 3. Configure environment

```bash
cp .env.example .env.local
```

Edit `.env.local` and fill in:

```env
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/bearing?retryWrites=true&w=majority
GROQ_API_KEY=gsk_...
```

### 4. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Architecture

### API flow (critical — no hallucinated game names)

```
POST /api/analyze
  │
  ├─ 1. Rate limit check (5 req/min/IP — in-memory)
  │
  ├─ 2. SteamSpy fetch (lib/steamspy.ts)
  │      └─ Check MongoDB cache (TTL: 4 hours)
  │         ├─ Cache hit → return cached games
  │         └─ Cache miss → fetch from steamspy.com/api.php
  │
  ├─ 3. Steam Web API (lib/steam.ts)
  │      └─ Fetch descriptions for top 30 games (in-memory cache, 24h)
  │
  ├─ 4. AI analysis (lib/groq.ts)
  │      └─ System prompt enforces: ONLY use games from the provided list
  │         AI cannot add any game not in the dataset
  │
  └─ 5. Return JSON response with comparable games + context
```

### MongoDB collection

| Collection | Purpose | TTL |
|---|---|---|
| `steamspy_cache` | Genre → games index | 4 hours |

### Rate limiting

5 requests per IP per minute. In-memory sliding window (resets on server restart). For production, replace with Redis-backed rate limiter.

---

## Project structure

```
bearing_app/
├── app/
│   ├── globals.css          # Brand tokens + all component styles
│   ├── layout.tsx           # Google Fonts + metadata
│   ├── page.tsx             # Hero landing page
│   ├── analyze/
│   │   └── page.tsx         # Form + results page
│   └── api/
│       └── analyze/
│           └── route.ts     # POST endpoint (main pipeline)
├── components/
│   ├── IdeaForm.tsx         # Multi-select genre chips + form
│   └── AnalysisReport.tsx   # Report renderer with game cards
├── lib/
│   ├── mongodb.ts           # Connection singleton
│   ├── steamspy.ts          # SteamSpy + MongoDB cache
│   ├── steam.ts             # Steam Web API integration
│   ├── groq.ts              # AI prompt + analysis
│   └── ratelimit.ts         # In-memory rate limiter
└── types/
    └── index.ts             # Shared TypeScript types
```

---

## Deliberate MVP exclusions

The following are **intentionally not included** in this version:

- ❌ User accounts / authentication
- ❌ PDF / Word export
- ❌ Payment system
- ❌ Persistent idea storage

These can be added in future iterations once the core validation loop is proven.

---

## Data disclaimer

All ownership and revenue figures come from SteamSpy estimates, which carry significant uncertainty. Bearing provides context — not predictions. Your idea is never stored and is not used to train any AI model.
