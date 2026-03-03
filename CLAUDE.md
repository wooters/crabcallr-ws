# CLAUDE.md

## What this is

WebSocket message router for CrabCallr. Routes messages between OpenClaw plugins and LiveKit voice agents. Zero-knowledge relay — never stores, logs, or inspects message content.

## Development

```bash
npm install
cp .env.example .env   # fill in values
npm run dev             # watch mode
```

## Build / Lint / Test

```bash
npm run build
npm run lint
npm test -- --run
```

## Deployment

```bash
fly deploy
```

## Protocol Schema

The canonical protocol schema lives in the main CrabCallr monorepo. This repo has a copy at `protocol/crabcallr-protocol.schema.json`.

When the schema changes upstream:
1. Copy the updated schema into `protocol/`
2. Run `npm test -- --run` to verify compliance
3. Update types in `src/types/messages.ts` if needed

## Architecture

- `src/index.ts` — HTTP server, health/metrics endpoints
- `src/websocket/` — WebSocket connection handling for plugins and agents
- `src/types/` — Message types and type guards
- `src/services/` — Supabase edge function clients (API key validation, usage reporting)
