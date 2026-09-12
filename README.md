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
- The token registry combines a searchable runtime registry with curated fallback entries for Ethereum, Arbitrum, BNB Chain, and Robinhood Chain, with chain-specific addresses and local token imagery.
- In development, the managed API invokes the locally authenticated Claude Code subscription directly. It stores validated, sanitized review results in the managed SQLite database. Non-development environments return an explicit not-implemented response and do not start Claude Code.
- The original basket planner still supports wrapping, approvals, Classic Swap routes, and EIP-5792 atomic wallet batches where the connected wallet exposes that capability.

## Workflow and wallet modes

The managed LP workflow is designed for one managed group per execution wallet on one chain.

The manual mode is designed for an external browser wallet and requires the owner to review and sign each supported transaction.
Managed external-wallet execution is admitted only when the authenticated owner is the execution account and its runtime passes the named `simple7702-self-signed-v1` adapter checks for the verified Simple7702Account implementation.
Controlled-fork lifecycle evidence covers this account path on Ethereum, Arbitrum, BNB Chain, and Robinhood Chain in the [external-adapter results](references/ethglobal-competitive-analysis/external-adapter-fork.json) and [Ethereum execution report](references/ethglobal-competitive-analysis/ethereum-managed-execution.md).
These are isolated forks with synthetic accounts and no public broadcasts.
They do not establish compatibility with MetaMask, Coinbase Wallet, or any other third-party wallet brand, and a wallet's generic EIP-5792 capability report is not sufficient evidence for this adapter.

The local development review can analyze a managed group and return a validated hold, fund-and-open, replace, close, or propose-conversion result, but model output is never transaction authorization.

Explicit owner confirmation can submit supported original basket transactions through the external-wallet path or the optional local development signer.
The managed workflow exposes review and close planning for external wallets, while execution remains gated until the selected account passes the named adapter checks.
Starting the app and running read-only verification do not submit transactions by themselves.
The local development signer can use real funds when explicitly configured, and its setup and evidence are separate from external-wallet compatibility and local-fork fixtures.

Recurring reviews require an active browser lease and pause when the browser heartbeat expires.
The current lease timeout is 45 seconds.
The visible lease-owning tab sends a heartbeat every ten seconds while the bot runs.
Passive transaction reconciliation is a separate eight-second visible-tab loop that runs only while a submitted or unknown transaction attempt needs recovery.
It does not provide continuous observation of passive positions.
Use the explicit Reconcile action to refresh positions when no unresolved transaction triggers that recovery loop.
Stopping the bot or losing the browser lease pauses management, does not dock existing Aqua strategies, and cannot cancel a transaction that was already submitted.
Existing passive positions can continue filling after a pause until they are closed or their configured program expiry makes them inactive.
Confirmed Close retires the selected positions.
This is browser-bound management, not 24/7 operation or guaranteed stop-loss protection.

The optional delegated Privy path is disabled until authorization, refusal, expiry, revocation, and owner-recovery evidence passes for a specific wallet and chain.
The application does not claim general external-wallet compatibility or delegated execution from mock tests.

The directional market-making recipe is disabled because the installed and tested deployed instruction path does not yet establish a supported LimitSwap encoding.
Hedera payments and Blocky402 fulfillment are deferred, and the current review entitlement is explicitly uncharged development use.

## Supported networks

The current token and RPC configuration names these EVM networks:

- Ethereum
- Arbitrum
- BNB Chain
- Robinhood Chain

Network support means that the application has configuration and token-catalog coverage for that network.
A listed token is not proof of a usable funding route or an executable Aqua strategy.
Route validation is separate from registry listing, and a successful quote applies only to its amount, direction, and observation time, so it must be refreshed for the intended operation.
Network support does not by itself prove a successful LP registration, resolver discovery, fill, or delegated execution on that network.

## Quick start

Required local tools are Node.js 22.13 or newer and npm. Development reviews also require the locally installed Claude Code CLI with an active Claude subscription login. Docker is not part of the application review path.

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
`PRIVATE_KEY` is a server-side secret read only by explicitly invoked local development-wallet and live verification or funding paths.
It is not required to start the frontend, use an external browser wallet, or run read-only verification, and must never be committed, exposed to browser code, sent to the local Claude Code process, or configured on a public or production server.
Starting the frontend and running read-only verification do not submit transactions by themselves.
Explicit owner confirmation can submit through the connected external wallet, and the optional development-wallet adapter can sign real transactions when configured.

The optional local development wallet is a real-funds server-side signer for explicit local testing.
Enable it only on a loopback development server by adding these server-only settings to `apps/frontend/.env`:

```dotenv
AQUAMUX_DEV_WALLET=true
AQUAMUX_DEV_WALLET_ORIGIN=http://127.0.0.1:3100
AQUAMUX_AUTH_ORIGIN=http://127.0.0.1:3100
AQUAMUX_DEV_WALLET_MAX_FEE_WEI=300000000000000
```

The development wallet requires `NODE_ENV=development`, an exact origin matching the browser URL, and the existing server-only `PRIVATE_KEY` and RPC settings.
The fee cap is 0.0003 native units, and managed plans also apply their configured gas budget.
Keep this server bound to loopback and require explicit owner confirmation for every submission.
The adapter supports Ethereum, Arbitrum, BNB Chain, and Robinhood Chain in the current configuration and recorded controlled-fork evidence.
Production mode rejects the opt-in, and forwarded or non-loopback requests are rejected.
This opt-in does not establish third-party wallet-brand compatibility or live public-chain execution.
See the [development-wallet results](references/ethglobal-competitive-analysis/dev-wallet-results.md) for the setup boundary and evidence.

## Local development reviews

A development instance invokes the locally installed Claude Code CLI from the managed API. Install Claude Code and complete its Claude subscription login for the same operating-system user that starts Next.js:

```sh
claude auth login
cd apps/frontend
npm run dev
```

No Anthropic API key, runner URL, runner token, Docker engine, or second service is used. The app starts Claude Code in a fresh temporary directory with tools, MCP configuration, session persistence, and inherited application secrets disabled. It sends the validated review request through standard input and keeps prompts, wallet data, credentials, and raw model reasoning out of browser code and durable evidence.

This path runs only when `NODE_ENV=development`. Every other environment returns HTTP 501 with `review_not_implemented` for proposal and review requests, and never starts a local agent process. See the [redacted inline review check](apps/frontend/verification/INLINE_DEVELOPMENT_REVIEW.md) for the exact prerequisites and recorded result.

## Development

Run frontend commands from `apps/frontend`:

```sh
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
```

The default Playwright configuration starts or reuses a frontend at `http://127.0.0.1:3100` and discovers the ordinary E2E suite.
Run `npm run test:e2e -- --list` to inspect discovery without running the suite.
The managed suite uses `apps/frontend/e2e/managed.config.ts`, targets `MANAGED_E2E_URL` or `http://127.0.0.1:33127`, and expects a separately started server.
Use the managed suite only after that server has the fixture or explicitly configured development-wallet prerequisites required by its tests.
Ordinary frontend startup does not enable the local development wallet.

The unit suite covers both review environments. It verifies that development invokes the restricted local Claude Code command with sanitized process variables, while non-development returns the stable not-implemented response without an invocation.

## Verification and live signing

Run the following verification commands from `apps/frontend`.
The fork verifier is intended to run against an isolated local Arbitrum Anvil fork and requires `ARBITRUM_RPC_URL`:

```sh
npm run verify:fork
```

The verifier uses port 18547 by default.
Set `AQUAMUX_TEST_PORT` to an unused port when that port is occupied.

The September 12, 2026 lifecycle run passed 15 isolated Arbitrum fork checks after correcting the fixture path, range schema, and transparent-route integration.
The [lifecycle results](references/ethglobal-competitive-analysis/lifecycle-results.md) and [lifecycle quality review](references/ethglobal-competitive-analysis/lifecycle-quality-review.md) record the fixture boundary and verification details.
This fork evidence does not establish present live execution, public resolver discovery, or complete application E2E acceptance.

Read-only receipt and position checks use the recorded `verification/live-execution.json` input:

```sh
npm run verify:live
```

This command checks the receipts and positions recorded in that file.
It does not perform fresh live execution or prove a current LP lifecycle.

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

The [runtime spike results](references/ethglobal-competitive-analysis/runtime-spike-results.md) are retained as historical pre-launch evidence. The current development review path is the in-app Claude Code integration documented above.

The [implementation task map](references/ethglobal-competitive-analysis/implementation-task-map.md) lists ownership, review gates, remaining integration work, and the commands that must be refreshed before release claims.

The [frontend guide](apps/frontend/README.md) contains the frontend command reference and its application environment variables. Development-wallet settings belong to the setup section above and the relevant evidence reports.

## Boundaries

The current implementation does not claim complete LP lifecycle acceptance, external resolver discovery, fill profitability, complete transfer-audit coverage, broad browser-wallet compatibility, Privy delegated execution, directional market making, or paid Hedera reviews.

Unknown balances, fills, fee components, and performance remain unknown when observation coverage is incomplete.

The app does not move positions between an external wallet and a Privy execution wallet merely because a user selects a different mode.

The local Claude Code integration is not a production multi-user signing boundary.
No signing key, wallet credential, production database credential, or raw model reasoning belongs in its process environment or durable evidence.

Do not interpret a successful plan simulation, mock wallet test, old receipt, or local fork setup as proof of present live-chain execution.
