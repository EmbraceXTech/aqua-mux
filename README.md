<div align="center">
  <img src="assets/aquamux-wallpaper.png" alt="AquaMux" width="100%" />

  # AquaMux

  **Compose multi-asset swaps and shared-liquidity LP strategies in atomic wallet batches.**

  [Quick start](#quick-start) · [Features](#features) · [How-it-works](#how-it-works) · [Documentation](#documentation)
</div>

## Overview

1inch Aqua lets liquidity providers keep tokens in their wallet while authorizing virtual balances for trading strategies. The same balance can support multiple pools, fee tiers, or strategies, rather than being split between isolated pools.

AquaMux makes that shared-liquidity model practical through a focused workflow: build a multi-asset basket from one input, then register multiple LP strategies in atomic batches.

> **Shared liquidity is not extra capital.** Every strategy references the same base-token balance; a fill in one changes the real inventory available to the others.

## Features

- **One input, many outputs** — Swap one token into two to six selected assets in one atomic transaction. Allocations total 100%, and integer arithmetic preserves the full input amount.
- **Shared-liquidity LPs** — Use the full selected base-token amount as a shared virtual balance across multiple Aqua strategies, including different paired assets and fee settings.
- **Atomic execution** — Combines wrapping (when needed), approvals, swaps, and Aqua `ship` calls with EIP-5792 `wallet_sendCalls` and `atomicRequired: true`.
- **Self-custody** — Tokens remain in the connected wallet under Aqua allowance; AquaMux does not deploy a custody contract or access signing keys.
- **Multi-chain** — Ethereum, Arbitrum, Robinhood Chain, and BNB Chain.

## How it works

### 1. Create a basket

Choose a single input token, two to six output tokens, and their allocations. AquaMux obtains a Classic Swap route for each output and submits all routes as one atomic wallet batch.

### 2. Create LP strategies

Choose a base token and pair it with assets already held in the connected wallet. AquaMux can register multiple Aqua LP strategies with the same full base-token virtual balance in one atomic batch.

Paired assets are required inventory: AquaMux does not automatically swap one funding token into both sides of LP positions. LP registration also does not guarantee resolver discovery, fills, or earnings.

## Quick start

```sh
cd apps/frontend
npm install
cp .env.example .env
npm run dev
```

Open [http://127.0.0.1:3100](http://127.0.0.1:3100). Add the required RPC URLs to `.env`; `ONEINCH_API_KEY` is required for live Classic Swap quotes and execution.

## Architecture

| Component | Role |
| --- | --- |
| [1inch Aqua](https://business.1inch.com/portal/documentation/aqua/overview) | Shared-liquidity layer backed by wallet-held tokens and virtual balances. |
| SwapVM | Composable AMM and LP-strategy logic. |
| 1inch Classic Swap API | Routes each output in a multi-swap basket. |
| EIP-5792 wallet | Simulates, estimates, signs, and submits atomic call batches. |

AquaMux checks wallet atomic-batch capability and never silently falls back to separate transactions. The application server does not read signing keys. Plans are invalidated when their inputs or connected account changes.

## Documentation

- **[Frontend guide](apps/frontend/README.md)** — environment variables, all commands, tests, and fork/live verification.
- [Aqua 1.0 whitepaper](references/whitepaper-aqua-1.0.pdf)
- [SwapVM 1.0 whitepaper](references/whitepaper-swap-vm-1.0.pdf)
- [Vendored Aqua implementation](references/aqua)
- [Build an Aqua app with SwapVM](https://business.1inch.com/portal/documentation/aqua/getting-started/build-an-aquaapp)
