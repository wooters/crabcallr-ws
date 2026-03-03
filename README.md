# crabcallr-ws

WebSocket message router for [CrabCallr](https://crabcallr.com) — the voice interface for [OpenClaw](https://openclaw.com).

## Why this repo is public

This is the component that handles all communication between your OpenClaw plugin and the CrabCallr voice pipeline. We open-sourced it so you can verify for yourself: **ws-manager is a fire-and-forget relay that never stores, logs, or inspects message content.**

Your conversations pass through this router in real time and are immediately discarded.

## What is stored vs. what isn't

| Data | Stored? | Purpose |
|------|---------|---------|
| Message content (your conversations) | **Never** | Relayed in real time, never persisted |
| Call metadata (duration, source type) | Yes | Billing and usage tracking |
| API key validation results | Yes | Authentication |
| Connection presence (online/offline) | Ephemeral | Dashboard indicator via Supabase Realtime |

## Architecture

```text
┌─────────────────────┐  AGENT_SECRET   ┌─────────────────────┐
│ livekit-voice-agent │ ──────────────▶ │     ws-manager      │
└─────────────────────┘                 └──────┬─────┬────────┘
                                               │     │
┌─────────────────────┐  API_KEY        ┌──────┴─────┴────────┐
│  OpenClaw plugin    │ ──────────────▶ │                     │
└─────────────────────┘                 │                     │
                                        ▼                     ▼
                              ┌─────────────────┐   ┌─────────────────┐
                              │ validate-api-key│   │  report-usage   │
                              │ (edge function) │   │ (edge function) │
                              └─────────────────┘   └─────────────────┘

                              ┌─────────────────┐
                              │ Supabase        │
                 ws-manager ─▶│ Realtime        │◀─ Dashboard (browser)
                              │ (presence)      │
                              └─────────────────┘
```

Database operations are performed via Supabase edge functions:

- **validate-api-key**: Validates plugin API keys against the profiles table
- **report-usage**: Reports call usage for billing (updates seconds_used, reports to Stripe)

The ws-manager also connects to **Supabase Realtime** (optional) to broadcast plugin connection presence, which the dashboard uses to show a live connected/disconnected indicator.

## Local Development

```bash
npm install
cp .env.example .env   # fill in values
npm run dev
```

## Deployment to Fly.io

### Prerequisites

- [Fly CLI](https://fly.io/docs/hands-on/install-flyctl/) installed and authenticated (`fly auth login`)

### Set Secrets

Secrets are stored securely in Fly.io, not in files:

```bash
fly secrets set \
  SUPABASE_FUNCTIONS_URL="https://your-project.supabase.co/functions/v1" \
  AGENT_SECRET="your-shared-secret-with-voice-agent" \
  VALIDATE_API_KEY_SECRET="your-shared-secret-with-validate-api-key-function" \
  USAGE_REPORT_SECRET="your-shared-secret-with-report-usage-function" \
  SUPABASE_URL="https://your-project.supabase.co" \
  SUPABASE_ANON_KEY="your-legacy-jwt-anon-key"
```

- `AGENT_SECRET` is shared with the livekit-voice-agent for WebSocket authentication
- `VALIDATE_API_KEY_SECRET` is shared with the Supabase `validate-api-key` edge function
- `USAGE_REPORT_SECRET` is shared with the Supabase `report-usage` edge function
- `SUPABASE_URL` and `SUPABASE_ANON_KEY` enable plugin presence tracking on the dashboard (optional). **Note:** `SUPABASE_ANON_KEY` must be the legacy JWT anon key (`eyJ...`), not the publishable key (`sb_publishable_...`), because Supabase Realtime requires a JWT.

### Deploy

```bash
fly deploy
```

### Useful Commands

```bash
fly status          # Check app status
fly logs            # View logs (add -f to follow)
fly secrets list    # See which secrets are set (values hidden)
fly ssh console     # SSH into the running container
```

## Environment Variables

| Variable                  | Description                                                                | Required |
| ------------------------- | -------------------------------------------------------------------------- | -------- |
| `PORT`                    | Server port (default: 8080)                                                | No       |
| `NODE_ENV`                | Environment (development/production)                                       | No       |
| `SUPABASE_FUNCTIONS_URL`  | Supabase edge functions URL (e.g., `https://xxx.supabase.co/functions/v1`) | Yes      |
| `AGENT_SECRET`            | Shared secret for livekit-voice-agent WebSocket auth                       | Yes      |
| `VALIDATE_API_KEY_SECRET` | Shared secret for validate-api-key edge function                           | Yes      |
| `USAGE_REPORT_SECRET`     | Shared secret for report-usage edge function                               | Yes      |
| `LOG_LEVEL`               | Logging level (default: info)                                              | No       |
| `SUPABASE_URL`            | Supabase project URL (enables plugin presence tracking)                    | No       |
| `SUPABASE_ANON_KEY`       | Supabase legacy JWT anon key (enables plugin presence tracking)            | No       |

## Contributing

Found a bug or have a suggestion? [Open an issue](https://github.com/wooters/crabcallr-ws/issues).

## License

MIT
