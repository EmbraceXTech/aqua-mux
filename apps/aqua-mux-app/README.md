# AquaMux frontend

This directory contains the AquaMux Next.js app. For the project overview, supported networks, execution model, and security guarantees, see the [root README](../../README.md).

## Quick start

From the repository root:

```sh
npm ci
npm --prefix apps/aqua-mux-app ci
[ -f .env ] || cp .env.example .env
npm run dev
```

Open the loopback URL printed by `npm run dev`. Each development server picks a random available port. Set one explicitly with `PORT=3100 npm run dev`.

Populate the root `.env` with RPC URLs for each desired network. `npm run dev` copies it to `apps/aqua-mux-app/.env` before Next.js starts. `ONEINCH_API_KEY` is required for live Classic Swap quotes and execution. Environment variables are consumed only by server modules and are excluded from Git. Do not commit secrets. Development reviews use the locally installed Claude Code subscription session, not an Anthropic API key.

```dotenv
ETHEREUM_RPC_URL=
ARBITRUM_RPC_URL=
ROBINHOOD_RPC_URL=
BNB_RPC_URL=
ONEINCH_API_KEY=
```

## Commands

Run all commands from `apps/aqua-mux-app`.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server on a random loopback port. Set `PORT` to choose one. |
| `npm run build` | Create a production build. |
| `npm run start` | Serve the production build on `127.0.0.1:3100`. |
| `npm run typecheck` | Type-check without emitting files. |
| `npm run lint` | Run ESLint with warnings treated as failures. |
| `npm test` | Run unit tests, including development and non-development review behavior. |
| `npm run test:review` | Run the review runner and cancellation tests. |
| `npm run test:review:live` | Make one synthetic, read-only review request against a running local app. |
| `npm run test:e2e` | Run Playwright browser tests. |
| `npm run sync:tokens` | Refresh the curated token catalog and images from 1inch token lists. |
| `npm run format` | Format application, test, script, and configuration files. |
| `npm run verify:fork` | Run isolated Anvil-fork integration verification. |
| `npm run verify:live` | Read-only verification of recorded live receipts and positions. |
| `npm run test:live -- --execute` | Submit bounded, small live transactions; requires `PRIVATE_KEY` in `.env`. |

## Local development reviews

With `NODE_ENV=development`, managed proposal and review requests invoke the local Claude Code CLI directly. Install Claude Code and authenticate its subscription for the operating-system user that starts Next.js:

```sh
claude auth login
npm run dev
```

No runner service, Docker engine, API key, or review token is required. The app runs Claude Code with tools and inherited application secrets disabled. Other environments return `501 review_not_implemented` and never start the CLI. The [recorded inline check](verification/INLINE_DEVELOPMENT_REVIEW.md) lists the exact prerequisites and redacted result.

## Verification notes

`verify:fork` starts an isolated Arbitrum Anvil fork on port `18547` (override with `AQUAMUX_TEST_PORT`). It uses canonical Aqua, SwapVM, and WETH deployments, installs fixtures only on the local fork, and never sends live-chain transactions. Results are written to `verification/fork.json`.

The live commands are separate from normal tests and builds. `verify:live` is read-only. `test:live -- --execute` is the only command that can submit transactions; it requires an explicit flag and a local `PRIVATE_KEY`. Results are stored in `verification/live-execution.json`; see [live execution results](verification/LIVE_RESULTS.md) for recorded outcomes and limitations.
