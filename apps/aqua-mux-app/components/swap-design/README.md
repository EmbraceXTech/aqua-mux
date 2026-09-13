# Archived swap implementation

The routes now render `components/views/SwapView.tsx`, with production components and styles under `components/swap/`. This folder is no longer imported by either route and can be removed. See `components/swap/README.md` for the current architecture and checks.

The notes below describe the original live integration before extraction.

`/swap` and `/swap/design` render the same live Arbitrum swap builder. The previous managed one-to-many components remain in the repository but are not this page's execution path.

## Supported trades

- One-to-many, many-to-one, and single-token swaps.
- Exact input or exact output, using integer token units throughout.
- Six curated Arbitrum assets: ETH, native USDC, WBTC, ARB, LINK, and DAI.
- Direct Uniswap v3 pools with selectable 0.01%, 0.05%, 0.3%, or 1% fee tiers. There is no multihop discovery or best-price aggregation. Missing pools fail with a route-specific error; the app never substitutes a simulated quote.
- Global slippage of 0.01% to 5%, enforced separately on every leg. Exact-input minimums round down; exact-output maximums round up.

For one-to-many exact-input trades, allocations split the input token. For many-to-one exact-output trades, allocations split the requested output amount between input routes. Other combinations specify each expanded-side amount directly. Percentages are not dollar-value estimates.

The old `model.ts` and `model.test.ts` contain the original design fixtures. The live component does not import them. It does not display sample balances or fabricated USD prices.

## Execution

`lib/live-swap.ts` validates drafts, constructs routes, applies slippage, and encodes the router transaction. `/api/live-swap` obtains quotes at one block from the deployed Quoter and reads balances and allowances. It requires server-side `ARBITRUM_RPC_URL`; no 1inch API key or private key is used by this flow.

`hooks/useLiveSwap.ts` connects to an injected EIP-1193 wallet without an authentication signature. Quotes last 30 seconds. Account, chain, draft, quote expiry, balances, and allowances are checked again before submission. The wallet RPC simulates the full transaction and estimates gas before a confirmation request.

All swap legs execute in one `SwapRouter.multicall`. Native input is wrapped by the router; unused ETH is refunded in the same transaction. Native output is collected as WETH and unwrapped to the connected account after every swap leg completes.

ERC-20 approvals are separate transactions, capped at the reviewed maximum input. Existing insufficient nonzero allowances are reset to zero first. The app never automatically proceeds from approval to swap. Each step requires a new user action and wallet confirmation.

The router deadline is ten minutes from transaction preparation. The review shows a countdown while the wallet request is open and instructs the user to reject an expired request. Slippage limits remain the reviewed limits throughout that period. Network fees are additional and shown by the wallet.

## Transaction status

A wallet-returned hash is not proof of broadcast or success. The page polls the transaction and receipt. Only receipt status `0x1` means confirmed; `0x0` means reverted. If neither transaction nor receipt appears for 60 seconds, the page reports that the transaction is unlocated instead of claiming it is still pending on-chain. It keeps checking and blocks duplicate submission. RPC failures and ambiguous submission errors never trigger an automatic retry.

Tracking is in memory, not persisted with wallet details. The page warns before leaving with an unresolved request. After a reload, users must check wallet activity before submitting another trade. This is not durable cross-tab transaction recovery.

## Verification

Run from `apps/aqua-mux-app`:

```sh
npx tsx --test test/live-swap.test.ts test/swap-transaction-status.test.ts
npx tsx scripts/verify-live-swap-fork.ts
# With the app running at http://127.0.0.1:3101:
npx tsx scripts/test-live-swap-ui.ts
```

The fork script starts its own loopback Anvil process, reads Arbitrum state, and funds a synthetic local account. It never uses a mainnet signer or the user's wallet. It verifies successful mined swaps and actual balance changes in all four direction/amount combinations, bounded approvals, ETH refunds, atomic rollback when the second leg fails, a three-minute confirmation delay, and deadline expiry. The process stops in `finally`.

The UI script launches an isolated browser with a synthetic wallet and mocked quote API. It checks rejection, both modes and exact sides, allocation errors, approval review, confirmed/reverted receipts, unlocated hashes, mobile overflow, and runtime errors. These UI tests do not establish mainnet execution success.

Live read-only testing verified real Arbitrum quotes in all four combinations and connected MetaMask balances. Mainnet execution has not been proven successful. MetaMask's status tooltip reported `cancelled, originalTransactionStatus: FAILED_WOULD_REVERT`. Its Smart Transaction service cancelled the request before broadcast, and neither queried Arbitrum RPC endpoint had the transaction or receipt. The tooltip did not identify the underlying contract revert reason. Deadline expiry is reproducible on the fork, but cannot be established as the cause of this particular wallet cancellation.

The targeted unit tests and lint checks pass. Repository-wide typechecking currently fails because the existing `lib/server/dev-wallet/managed-plan.test.ts` imports the absent `test/lifecycle-fixtures` module.

## Contract references

- [Arbitrum Uniswap v3 deployment addresses](https://developers.uniswap.org/docs/protocols/v3/deployments/v3-arbitrum-deployments)
- [SwapRouter interface](https://github.com/Uniswap/v3-periphery/blob/main/contracts/interfaces/ISwapRouter.sol)
- [Native payment, unwrap, and refund implementation](https://github.com/Uniswap/v3-periphery/blob/main/contracts/base/PeripheryPayments.sol)

The integration uses the original `SwapRouter` at `0xe592427a0aece92de3edee1f18e0157c05861564` and Quoter at `0xb27308f9f90d607463bb33ea1bebb41c27ce5ab6`, not `SwapRouter02`. Its ABI includes a per-swap deadline.
