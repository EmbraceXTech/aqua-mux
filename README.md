<div align="center">
  <img src="assets/aquamux-wallpaper.png" alt="AquaMux" width="100%" />

  # AquaMux

  **Managed liquidity workflows for shared Aqua positions, with wallet-aware plans and browser-bound reviews.**

  [Quick start](#quick-start) | [Implemented](#implemented) | [Development](#development) | [Evidence](#evidence) | [Boundaries](#boundaries)
</div>

## Overview

AquaMux builds deterministic, reviewable LP plans around the 1inch Aqua shared-liquidity model.

The managed workflow reads the selected maker wallet and chain, proposes a versioned LP configuration, stores the plan and review history in local SQLite, and keeps execution behind explicit owner confirmation.

The existing basket flow remains available for composing one input token into two to six outputs in an atomic wallet batch.

Shared liquidity is not extra capital.
Each Aqua strategy references real inventory in the maker wallet, so a fill in one strategy changes the inventory available to its siblings.

## Implemented

- Managed LP configuration supports one to six distinct economic pairs, pair-specific fees, full or bounded ranges, integer reserve amounts, explicit price denomination, and optional program expiry.
- The managed workspace contains Strategy, Positions, Activity, and Controls views for proposal review, current backing, observed activity, browser-bound runs, stopping, and close planning.
- Owner-scoped records, review history, lifecycle plans, idempotency, execution locks, and migrations use durable local SQLite at `.data/managed.sqlite` by default.
- Wallet ownership uses origin-bound challenges and expiring bearer sessions for the local prototype.
- Position observation decodes deployed Aqua registration and SwapVM fill events, reconciles current backing, recovers submitted receipts, and reports incomplete coverage instead of inventing inactivity or performance.
- The token registry contains curated entries for Ethereum, Arbitrum, BNB Chain, and Robinhood Chain, with chain-specific addresses and local token imagery.
- The local ReviewService uses the AI SDK HarnessAgent adapters for Codex or Claude, stores sanitized review results and usage, and exposes an authenticated loopback HTTP endpoint.
- The runner uses a disposable non-root Docker environment without host mounts, signing material, repository access, or a Docker socket.
- The original basket planner still supports wrapping, approvals, Classic Swap routes, and EIP-5792 atomic wallet batches where the connected wallet exposes that capability.

## Workflow and wallet modes

The managed LP workflow is designed for one managed group per execution wallet on one chain.

The manual mode uses an external browser wallet and requires the owner to review and sign each supported transaction.

The local review runner can analyze a managed group and return a validated hold, fund-and-open, replace, close, or propose-conversion result, but model output is never transaction authorization.

Recurring reviews require an active browser lease and pause when the browser heartbeat expires.
This is browser-bound management, not 24/7 operation or guaranteed stop-loss protection.

The optional delegated Privy path is disabled until authorization, refusal, expiry, revocation, and owner-recovery evidence passes for a specific wallet and chain.
The application does not claim general external-wallet compatibility or delegated execution from mock tests.

The directional market-making recipe is disabled because the installed and tested deployed instruction path does not yet establish a supported LimitSwap encoding.
Hedera payments and Blocky402 fulfillment are deferred, and the current ReviewService entitlement is explicitly uncharged development use.

## Supported networks

The current token and RPC configuration names these EVM networks:

- Ethereum
- Arbitrum
- BNB Chain
- Robinhood Chain

Network support means that the application has configuration and token-catalog coverage for that network.
It does not by itself prove a successful LP registration, resolver discovery, fill, or delegated execution on that network.

## Quick start

Required local tools are Node.js 22 or newer, npm, and Docker.
Node.js 22.23.2 and a local OrbStack Docker engine were used for the recorded runner checks.

From the repository root, install and start the frontend:

```sh
cd apps/frontend
npm install
cp .env.example .env
npm run dev
```

Open [http://127.0.0.1:3100](http://127.0.0.1:3100).
The development server binds to loopback port 3100.

Put only these variable names in `apps/frontend/.env` as needed for the local environment:

```dotenv
ETHEREUM_RPC_URL=
ARBITRUM_RPC_URL=
ROBINHOOD_RPC_URL=
BNB_RPC_URL=
ONEINCH_API_KEY=
PRIVATE_KEY=
```

`ONEINCH_API_KEY` is required for live Classic Swap quotes and execution.
`PRIVATE_KEY` is read only by the explicit development-wallet and live verification paths, and must never be committed or sent to the agent runner.
The normal frontend and read-only verification paths do not submit transactions.

## Local ReviewService runner

The ReviewService is a private local prototype that uses the developer's existing Codex or Claude subscription through the installed HarnessAgent adapters.
It does not use an API key or a hosted multi-user inference service for the recorded subscription checks.

Start the runner from a second terminal while Docker is running:

```sh
cd apps/agent-runner
npm install
export AQUAMUX_AGENT_RUNNER_TOKEN="$(openssl rand -base64 32 | tr -d '\\n')"
export AQUAMUX_AGENT_RUNNER_PROVIDER=codex
npm run service
```

The runner listens on `127.0.0.1:4319` by default and stores its SQLite state under `apps/agent-runner/.runtime` unless `AQUAMUX_AGENT_RUNNER_DATABASE` is set.
The frontend managed service connects to the runner only when `AQUAMUX_AGENT_RUNNER_URL` and `AQUAMUX_AGENT_RUNNER_TOKEN` are configured in the server environment.
The runner token is a secret and must not appear in source, screenshots, logs, or committed files.

The runner's provider selection is `codex` or `claude` through `AQUAMUX_AGENT_RUNNER_PROVIDER`.
The tested Codex request used `gpt-6-astra` with medium reasoning.
The tested Claude request used the local Claude subscription adapter.

## Development

Run frontend commands from `apps/frontend`:

```sh
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
```

Run the runner's local and service checks from `apps/agent-runner`:

```sh
npm test
npm run test:service
npm run image:build
npm run test:docker
```

The subscription-backed compatibility matrix requires an existing local Codex or Claude login and Docker.
Run the provider checks one at a time:

```sh
npm run spike:adapters -- claude prepare
npm run spike:adapters -- claude resume
npm run spike:adapters -- codex prepare
npm run spike:adapters -- codex resume
```

Each `prepare` command must be followed by its matching `resume` command.
The checks retain only the provider-owned stopped container between those commands and remove it after the matrix completes.

## Verification and live signing

The frontend fork verifier is intended to run against an isolated local Arbitrum Anvil fork:

```sh
npm run verify:fork
```

The recorded baseline still has a fixture path and range-schema failure, so this command is not presented as complete lifecycle proof until the verifier owner reruns it successfully.

Read-only receipt and position checks use:

```sh
npm run verify:live
```

The only documented command that can submit bounded live verification transactions is:

```sh
npm run test:live -- --execute
```

That command requires the local `PRIVATE_KEY` variable and appropriate RPC and API configuration.
Use the authorized transaction executor and inspect the resulting report before making any live-compatibility claim.

## Evidence

The implementation plan and current acceptance boundaries are in [the LP and MM implementation plan](references/ethglobal-competitive-analysis/agent-lp-mm-implementation-plan.md).

The [managed core results](references/ethglobal-competitive-analysis/managed-core-results.md) record accepted contracts, owner-scoped storage, authentication, and focused tests.

The [position observation results](references/ethglobal-competitive-analysis/positions-results.md) record event decoding, reconciliation, receipt recovery, coverage rules, and focused tests.

The [token registry results](references/ethglobal-competitive-analysis/token-registry-results.md) record the expanded chain-specific catalog and validation.

The [runtime spike results](references/ethglobal-competitive-analysis/runtime-spike-results.md) record subscription-backed Codex and Claude requests, structured output, timeout, cancellation, restart recovery, Docker isolation, and sanitized evidence.

The [implementation task map](references/ethglobal-competitive-analysis/implementation-task-map.md) lists ownership, review gates, remaining integration work, and the commands that must be refreshed before release claims.

The [frontend guide](apps/frontend/README.md) contains the full environment variable list and frontend command reference.

## Boundaries

The current implementation does not claim complete LP lifecycle acceptance, external resolver discovery, fill profitability, complete transfer-audit coverage, broad browser-wallet compatibility, Privy delegated execution, directional market making, or paid Hedera reviews.

Unknown balances, fills, fee components, and performance remain unknown when observation coverage is incomplete.

The app does not move positions between an external wallet and a Privy execution wallet merely because a user selects a different mode.

The local runner is not a production multi-user signing boundary.
No signing key, wallet credential, production database credential, or raw model reasoning belongs in its environment or durable evidence.

Do not interpret a successful plan simulation, mock wallet test, old receipt, or local fork setup as proof of present live-chain execution.
