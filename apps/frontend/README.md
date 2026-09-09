# AquaMux

AquaMux composes one input into a basket of swaps, or shares one base-token balance across multiple 1inch Aqua LP pairs.
It is a separate Next.js app with shadcn-style Base UI components, viem, and the official Aqua and SwapVM SDKs.

## Run locally

```sh
cd projects/aquamux
npm ci
cp .env.example .env
npm run dev
```

Open [AquaMux](http://127.0.0.1:3100).
The development server binds to localhost on port 3100 and fails if the port is occupied.
For this workspace, AquaReplay's `.env` has already been copied with owner-only file permissions.
Do not overwrite it with the empty example.
RPC URLs and API credentials are read only in server modules and are excluded from Git.

## Networks and tokens

The app supports Ethereum, Arbitrum, Robinhood Chain, and BNB Chain, with chain IDs 1, 42161, 4663, and 56.
`GET /api/networks` verifies the actual RPC chain ID and checks bytecode at the canonical Aqua and SwapVM addresses.
All four configured RPCs and both contracts passed those checks during implementation.
The status is fetched again when the app opens.

Token addresses, decimals, and image URLs come from [1inch's chain-specific token lists](https://tokens.1inch.io/v1.2/42161).
The curated catalog and downloaded images include provenance in `lib/token-catalog.json`.
Robinhood stock-token images use Robinhood's CDN as referenced by the 1inch list.
The USDG and PONS images use the sources referenced by that list.
The app never infers an address from a symbol across chains.

```sh
npm run sync:tokens
```

## Multi-swap

Choose one input and between two and six output tokens.
Allocations must total exactly 100%.
Integer arithmetic preserves the full input amount and assigns rounding dust to the final output.
The server requests a route for each output through the official 1inch Classic Swap API, checks the router and transaction sender, and builds an atomic wallet batch.
Router targets and approval spenders use the chain-specific allowlist in `lib/config.ts`.
Robinhood uses `0x5a705de8982235a7fa45bb83dcacf03a211389c7`, verified against the authenticated 1inch spender endpoint and deployed bytecode.
The other supported chains use `0x111111125421ca6dc452d289314280a0f8842a65`.
The review includes each output minimum.
An ERC-20 input adds a required approval, while native input supplies the corresponding value to each swap.

Live quotes require `ONEINCH_API_KEY` in `.env` and an API plan with Classic Swap access on the chosen network.
The key is now configured in this workspace.
Live authenticated swaps and LP registration passed on Arbitrum, BNB Chain, and Robinhood Chain on September 9, 2026.
If the key is absent in another installation, the app shows an unavailable quote state and blocks public swap execution.
It does not display fixture amounts as market quotes.

Basket swaps use the Classic Swap API because the public Aqua route has resolver access restrictions.
SwapVM powers the LP strategies.
A fork test also demonstrates atomic one-to-many SwapVM fills with a local resolver-credential fixture.
That test is separate from the public Classic Swap integration.

## Multi-LP

Choose one base token and the amounts of paired tokens already held in the connected wallet.
Each strategy uses the full selected base amount as a shared virtual balance.
AquaMux does not split that base between pairs or claim that overlapping commitments create more capital.
A fill against one strategy changes the real inventory available to the others.

Native ETH or BNB adds a wrapping call to WETH or WBNB.
The batch approves Aqua for the required amounts and calls `ship` once per pair.
The wallet remains the maker because the wallet executes each call directly.
Tokens stay in the wallet after registration, under an allowance to Aqua.
The paired assets are required inventory; this implementation does not automatically swap a single funding asset into both sides of the LP positions.

Strategies use the pinned `AquaXYCAmmStrategy` SDK builder, input-token fees, a unique 64-bit salt, and the 1inch resolver credential check.
The range control selects full-range constant-product pricing or bounds around the raw reserve ratio.
Token ordering and decimal units follow the SDK encoding.
Reserve amounts and the curve determine pricing; the UI does not claim to know the live market price.
Registration does not guarantee resolver discovery, fills, earnings, or immediate indexing by 1inch Portfolio.

## Wallet execution

AquaMux uses an injected Ethereum wallet and EIP-5792 `wallet_sendCalls` with `atomicRequired: true`.
It checks atomic capability before submitting and never silently falls back to separate transactions.
Wallets without atomic support cannot execute the batch.
The wallet handles gas estimation, simulation, and signing.
No signing keys are read by the app server.
No production wallet or custody contract is deployed by AquaMux.

Plans expire and are invalidated when inputs or wallet accounts change.
Submitted batch IDs are retained in session storage so status tracking can resume after a refresh in the same browser tab.
The app distinguishes submission from confirmation and exposes transaction explorer links and the maker's 1inch Portfolio link.
A disconnected user can open the example portfolio supplied in the original brief.
Portfolio tracking itself remains on 1inch.

## Verification

```sh
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
npm run verify:fork
```

The unit tests cover exact allocation arithmetic, invalid inputs, token identity, SDK encoding, expired plans, account changes, and atomic wallet capability checks.
Browser tests cover both builders, chain switching, token selection, settings, mobile layout, a missing wallet, and a mocked wallet's review/submission/receipt flow.
The browser wallet fixture verifies UI transport behavior, not a real wallet implementation.

`verify:fork` starts an isolated Foundry Anvil fork of Arbitrum on localhost port 18547 and uses viem to execute transactions.
It rejects an occupied test port; `AQUAMUX_TEST_PORT` selects another port.
The test uses the forked canonical Aqua, SwapVM, and WETH deployments.
It installs paired-token fixtures and a resolver-credential fixture only on the local fork and deploys test wallets there.
It verifies wallet-owned shared liquidity, native wrapping, atomic LP registration, gated access, one-to-many SwapVM fills, and rollback when the final call fails.
It never sends live-chain transactions.
Evidence is saved to `verification/fork.json`.
`contracts/TestWallet.sol` contains test fixtures and is not a production wallet contract.

## Live execution verification

[Live execution results](verification/LIVE_RESULTS.md) includes the six transaction links, actual gas costs, active LP pairs, and limitations of the browser test.
The results came from the configured wallet at `0xA9aA0Af420578223B11FF5430d428055C52e8C89`.
The Chrome control runtime was unavailable and Computer Use timed out, so the runner used isolated Chromium with a viem-backed EIP-5792 adapter.
The UI, API, signer, transaction submission, and receipt checks were real.
This does not certify behavior of the user's MetaMask extension.

```sh
# Read-only re-verification of the existing receipts and active positions.
npm run verify:live

# Sends small live transactions, only with explicit --execute.
# Requires PRIVATE_KEY in the local .env file.
npm run test:live -- --execute
```

The live runner loads the private key only in its Node process.
It never adds a signing route to the app or passes the key to Chromium.
It verifies the existing Simple7702Account implementation's bytecode hash and uses bounded input and gas budgets.
It simulates the wallet's calls with its implementation code applied, because BNB's authorization-aware estimate understated the first delegated batch.
It pins transaction and authorization nonces together, and verifies account code after clearing temporary delegation.
Existing successful operations in `verification/live-execution.json` are not submitted again.
A transaction hash is saved as soon as the RPC returns it, and an unresolved recorded submission is checked before continuing.
Standard unit tests, browser tests, and builds do not send live transactions.

## Source references

- [Aqua overview and canonical deployments](https://business.1inch.com/portal/documentation/aqua/overview)
- [Composing Aqua strategies with SwapVM](https://business.1inch.com/portal/documentation/aqua/getting-started/build-an-aquaapp)
- [Resolver access and shared-inventory constraints](https://business.1inch.com/portal/documentation/aqua/liquidity-layer/access-resolvers-and-pathfinder)
- [Classic Swap API parameters](https://business.1inch.com/portal/documentation/apis/swap/classic-swap/methods/v6.1/1/swap/method/get)
- [Official TypeScript SDKs](https://github.com/1inch/sdks)
