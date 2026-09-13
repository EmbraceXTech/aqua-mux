# Live swap page

`/swap` and `/swap/design` render the live swap workspace. The production swap uses 1inch Classic Swap on Arbitrum, chain ID `42161`.

## Execution

The page supports one-to-many and many-to-one exact-input swaps. It requests one route and unsigned transaction from the 1inch Classic Swap API for each leg, then sends each returned transaction through the connected EIP-1193 wallet. It does not encode or call Uniswap v3 router methods.

`/api/live-swap` keeps `ONEINCH_API_KEY` on the server. It validates the selected tokens, connected account, expected Arbitrum chain, 1inch output amount, transaction calldata, transaction value, sender, and the pinned 1inch Classic Router. It rejects routes with non-empty simulation state overrides because the wallet simulation cannot reproduce them safely.

The review displays every leg's exact input, estimated output, minimum output, slippage, recipient, and 1inch router. Quotes expire after 30 seconds. The user confirms each leg separately, and the app waits for its receipt before enabling the next leg. The legs are not atomic. Before every signature, the client checks the connected account and chain again, refreshes balances, simulates the returned transaction, and estimates gas.

ERC-20 approvals are separate transactions. They approve only the reviewed maximum input amount to the pinned 1inch Classic Router. Existing insufficient nonzero allowances are reset to zero first. Approval never triggers a swap automatically.

## Transaction status

A wallet-returned hash is not proof of broadcast or success. The page polls the transaction and receipt. Receipt status `0x1` means confirmed and `0x0` means reverted. If neither transaction nor receipt appears for 60 seconds, the page reports an unlocated transaction and blocks duplicate submission.

## Verification

Run from `apps/aqua-mux-app`:

```sh
npx tsx --test test/live-swap.test.ts test/swap-draft.test.ts test/swap-transaction-status.test.ts
npm run typecheck
```

Set `ONEINCH_API_KEY` and `ARBITRUM_RPC_URL` in the root `.env` before requesting live quotes. Do not commit credentials.
