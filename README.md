# RPG Travel Agent Backend

A location-aware travel game prototype. It turns nearby places and user intent into optional RPG-style walking quests, a quest board, and a travel journal. This repository contains the **backend and a local test page**; it is not a complete mobile app.

## Why this project

The design question is how a travel assistant can use context without interrupting the user every time their location changes. The current implementation combines intent gating, a cooldown, a probability-based encounter rule, nearby POI lookup, and story generation. It uses a deterministic local fallback when the map or model keys are absent so the API can be inspected without paid services. Fallback output is sample data, not evidence of live map or model performance.

## Implemented pieces

- Fastify API for location sync, quest board, commission dialogue, generation, and completion.
- LangGraph flow for geographic side quests, with server-sent events for streamed story and route updates.
- AMap Web Service adapter and an OpenAI-compatible model adapter.
- Prisma/PostgreSQL schema for user attributes, achievements, and adventure journal state; a no-database mode supports local exploration.
- Rules for experience, achievements, buffs, cooldowns, and `Serendipity` encounter probability.
- A browser test page at `/` for trying backend endpoints.

## Run locally

Requires Node.js 20+. The verified local run reused the original project's installed dependencies. The GitHub Actions workflow runs `npm ci` from the repository lockfile in a clean runner.
```bash
npm ci
npm test
npm start
```

By default, the server binds to `127.0.0.1:3000`. Open `http://127.0.0.1:3000/` or check `http://127.0.0.1:3000/health`. No keys are required for the local fallback mode. Copy `.env.example` to `.env` to configure AMap, a model provider, or PostgreSQL. Keep `.env` private. To use the database, run `npm run prisma:generate` and `npm run prisma:migrate` with a valid `DATABASE_URL`.

The API has **no user authentication**. The included test page uses same-origin requests, and cross-origin access is disabled in this public copy. Do not deploy it on a public network without authentication, access controls, and a privacy review. Live map and model calls would send location or user text to the configured providers.

## Verified local behavior

On 2026-09-24, `npm test` passed in the local fallback environment. It builds the TypeScript code and checks health, commission intent gating, coordinate validation, and sample quest board output through in-process HTTP requests. With no database, map key, or model key, the server returned:

```text
GET /health -> {"status":"ok","service":"rpg-agent-backend","mode":"mock-without-database"}
POST /api/action/commission/interpret (text: "我现在在学习")
  -> {"shouldGenerateCommission":false,"scenario":"STUDYING","reply":"那我不打扰你啦。","askAccept":false}
POST /api/action/quest-board (sample coordinates, count: 2)
  -> status READY, 2 sample quests
```

These checks verify startup and selected fallback API paths. They do **not** verify live location updates, AMap queries, LLM generation, database persistence, mobile integration, latency, user experience, or quest quality. There is no public benchmark or user study.

## Code map

| Path | Role |
| --- | --- |
| `src/services/travel-agent.service.ts` | Location evaluation and quest flow |
| `src/services/commission.service.ts` | Intent and commission lifecycle |
| `src/services/agent-model.client.ts` | Model requests and local fallback |
| `src/services/amap-map.client.ts` | Nearby place lookup |
| `src/services/rule-engine.service.ts` | Progression and achievement rules |
| `src/controllers/` and `src/routes/` | HTTP and SSE endpoints |
| `prisma/` | Database schema and migration |

## Provenance

This is an original product engineering prototype built with Fastify, TypeScript, LangGraph, Prisma, and AMap APIs. Those libraries and services belong to their respective authors. It does not claim a research paper reproduction or measured improvement. The published copy excludes local credentials, installed dependencies, and build artifacts.
