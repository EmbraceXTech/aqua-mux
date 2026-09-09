# AquaMux frontend

This directory contains the AquaMux Next.js app. For the project overview, supported networks, execution model, and security guarantees, see the [root README](../../README.md).

## Quick start

From this directory:

```sh
npm install
cp .env.example .env
npm run dev
```

Open [http://127.0.0.1:3100](http://127.0.0.1:3100). The development server binds to localhost on port 3100 and fails if that port is occupied.

Populate `.env` with RPC URLs for each desired network. `ONEINCH_API_KEY` is required for live Classic Swap quotes and execution. Environment variables are consumed only by server modules and are excluded from Git. Do not commit secrets.

```dotenv
ETHEREUM_RPC_URL=
ARBITRUM_RPC_URL=
ROBINHOOD_RPC_URL=
BNB_RPC_URL=
ONEINCH_API_KEY=
```

## Commands

Run all commands from `apps/frontend`.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server on `127.0.0.1:3100`. |
| `npm run build` | Create a production build. |
| `npm run start` | Serve the production build on `127.0.0.1:3100`. |
| `npm run typecheck` | Type-check without emitting files. |
| `npm run lint` | Run ESLint with warnings treated as failures. |
| `npm test` | Run unit tests. |
| `npm run test:e2e` | Run Playwright browser tests. |
| `npm run sync:tokens` | Refresh the curated token catalog and images from 1inch token lists. |
| `npm run format` | Format application, test, script, and configuration files. |
| `npm run verify:fork` | Run isolated Anvil-fork integration verification. |
| `npm run verify:live` | Read-only verification of recorded live receipts and positions. |
| `npm run test:live -- --execute` | Submit bounded, small live transactions; requires `PRIVATE_KEY` in `.env`. |

## Verification notes

`verify:fork` starts an isolated Arbitrum Anvil fork on port `18547` (override with `AQUAMUX_TEST_PORT`). It uses canonical Aqua, SwapVM, and WETH deployments, installs fixtures only on the local fork, and never sends live-chain transactions. Results are written to `verification/fork.json`.

The live commands are separate from normal tests and builds. `verify:live` is read-only. `test:live -- --execute` is the only command that can submit transactions; it requires an explicit flag and a local `PRIVATE_KEY`. Results are stored in `verification/live-execution.json`; see [live execution results](verification/LIVE_RESULTS.md) for recorded outcomes and limitations.
