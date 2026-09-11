# Position observation results

The position observer decodes Aqua registration and inventory events, records SwapVM fills, reconciles current wallet backing, and recovers submitted transaction receipts without signing or submitting transactions.
The implementation uses the common managed SQLite store and exposes functions for the authenticated managed API.

## Ownership and module boundaries

This worker owns `apps/frontend/lib/server/positions/`, the new `apps/frontend/test/positions-*` files, and this report.
The core worker owns managed schemas and the SQLite implementation.
The API worker owns authenticated routes and calls these functions with the authenticated owner.
Existing dirty files outside this ownership were preserved.

| Module | Responsibility |
| --- | --- |
| `types.ts`, `abi.ts`, `decode.ts` | Explicit observation contracts and strict decoding of the actual non-indexed event signatures. |
| `observer.ts` | Bounded backfill, canonical block checks, duplicate suppression, finality delay, and checkpoint updates. |
| `rpc.ts`, `reconcile.ts` | Read-only viem adapter and block-pinned wallet balances, allowances, virtual allocations, and token counts. |
| `history.ts`, `inventory.ts` | Owner-scoped history and conservative attribution of unique real inventory. |
| `recovery.ts` | Receipt recovery with canonical hash checks and confirmation delay. |
| `store.ts`, `index.ts` | Common-store persistence, core record adapters, and public exports. |

## API integration

Import the functions from `lib/server/positions`.
Use `createPositionRpc(publicClient)` with the existing configured chain client.
Use `createObservationRepository(store, authenticatedOwner)` to persist an owner-scoped chain observation.
Use `toPositionRef(group, strategy)` to convert core strategy records after loading their authenticated group.

`observeChain(rpc, repository, config)` processes at most one configured block chunk.
The configuration requires chain ID, Aqua and SwapVM addresses, explicit start block, confirmation delay, and chunk size.
It never invents a deployment start block.
The cursor records the indexed-through block number and hash.
The confirmation policy means `head - confirmations`; this is a configured confirmation delay rather than a chain-specific economic finality guarantee.
A changed cursor hash invalidates retained history and restarts backfill from the declared start.
The observer also checks the retained cursor after fetching a new chunk to reject a reorg during that request.
A failed RPC read preserves the last checkpoint with unavailable monitoring health.
The store compare-and-swap rejects concurrent stale updates.

`reconcilePositions(rpc, refs, aqua)` always reads current head state for submission checks.
For accounting against an indexed cursor, pass the optional fourth argument `{ atBlock: observation.indexedThrough }` after checking that the cursor exists.
This mode verifies the requested hash and reads every balance at that canonical block.
For attributable inventory, also pass `baselineBlock: { number, hash }` so RPC verifies the baseline hash before and after the reads.
Current head reads and historical accounting reads must not be substituted for each other.
Sibling positions share real wallet reads while retaining separate virtual allocations.
A token count of 255 means docked, zero means unregistered, and missing or inconsistent counts remain unknown.
The minimum of virtual allocation, wallet balance, and allowance is an inventory upper bound only.

`getPositionHistory(observation, refs, authenticatedOwner, groupId)` separates registration, resolver discovery, last successful quote, observed fills, and monitoring health.
No observation produces null coverage rather than a claim of complete inactivity.
`recoverSubmittedTransactions(rpc, hashes, confirmations)` distinguishes submitted, confirmed, failed, and unknown receipts without attempting cancellation or replacement.
Its gas cost is the observed `gasUsed * effectiveGasPrice`; it does not claim a complete chain-specific cost decomposition.

`attributeGroupInventory` counts each baseline token once and uses Aqua movements instead of adding SwapVM amounts again.
It rejects duplicate baseline tokens, unbacked allocations, mismatched chains or block hashes, a baseline after the observation, shared use by another group, and unexplained wallet changes.
Aqua logs alone cannot prove the absence of external token transfers.
An independent complete transfer audit is therefore required before attribution is known; otherwise the caller must request explicit user-selected amounts.
The baseline and audit must identify the same maker, chain, canonical baseline block and hash, and exact audited-through block and hash as the accounting snapshot.
Transfer-audit evidence is trusted server input from an independent audit implementation.
Authenticated routes must never promote client-supplied completeness assertions into this evidence.
Realized profit, unrealized profit, fee decomposition, spread capture, and markout remain null.

## Validation

From `apps/frontend`, run:

```sh
npx tsx --test test/positions-*.test.ts
npx eslint lib/server/positions test/positions-*.ts --max-warnings=0
npx tsx test/positions-live-read.ts
```

The focused suite passed 18 tests.
It covers an installed Aqua SDK ABI fixture, both fill directions, docking, exact movement signs, duplicate logs, bounded backfill, reorg recovery, a reorg during chunk acquisition, unavailable RPC, wrong chain, partial backing, sibling shared reads, receipt recovery, owner isolation, SQLite reopen, stale revision refusal, and cross-fork accounting refusal.
Scoped ESLint passed.
The full frontend typecheck passed after the concurrent lifecycle test owner corrected its union narrowing.

The read-only live command uses existing public transaction fixtures from `verification/live-execution.json` and RPC credentials from the configured environment.
It prints no endpoint, credential, or signed transaction.
It does not modify the existing verification artifacts.
The following checks passed on 2026-09-11 between 20:08:42 and 20:08:45 UTC.

| Chain | Existing registration block | Current read block | Decoded Shipped events | Current registration | Receipt |
| --- | --- | --- | --- | --- | --- |
| Arbitrum 42161 | 503180892 | 504160061 | 2 | Both active | Confirmed |
| BNB 56 | 120775555 | 121323322 | 2 | Both active | Confirmed |
| Robinhood 4663 | 58090054 | 60527633 | 2 | Both active | Confirmed |

The receipt hashes were `0xe1b304f1289219368c89fc722ba6e52a93fcf0c324d74e3431cb89be50a77ef6`, `0x5b5e8d2808e11627aa3450032422dc8b3c33df155f6b3f2d39f78aa3d4adced2`, and `0x1d83ed15b576c62fc1bd0f0b21f4443ff22e7968bc13a12f3d8f1adea23d1df3`, respectively.
Aqua and SwapVM code were present on each chain.
The live command intentionally indexed only the registration block, so historical health remained backfilling and no full fill-coverage claim follows.

At Arbitrum block 504160061, WETH virtual allocation was 100000000000000 raw units per strategy, wallet balance was 209226636101739, and Aqua allowance was 1889659104481.
The resulting WETH inventory upper bound was 1889659104481 raw units per strategy, sharing the same real allowance.
WBTC virtual allocation was 311 raw units, wallet balance was 14, and allowance was 5, producing an upper bound of 5.
This demonstrates active registration with constrained backing and does not establish the cause of the inventory changes.

## Review and remaining integration boundaries

The coordinator assigned a separate code-quality reviewer, `ctx_d339c0f7239e`.
The reviewer identified a retained-prefix reorg race, insufficient accounting provenance checks, and the need for reconciliation at an explicitly finalized cursor.
The implementation now addresses these findings with focused regression tests.
The initial focused implementation commit is `2f3704a`.
Persistence, bounded history, provenance hardening, and live evidence are in `1ea39a2`.

No real transaction was sent by this worker.
The two-direction fill tests are ABI fixtures and do not replace the separately required credential-fixtured fork execution scenario.
Resolver discovery, successful live quotes, fee decomposition, and full historical backfill remain unproven by this read-only validation.
The current local store keeps an atomic observation document per owner and chain deployment.
It enforces a limit of 10000 events and 4 MiB of serialized event data, and rejects chunks with more than 10000 logs.
A capacity breach produces `limited` health and `history_limit` without advancing the cursor or claiming complete coverage.
Large hosted history requires paged event storage and a shared indexing service.
This worker does not enable delegated execution, configure a production indexer scheduler, or own the product's API and UI acceptance tests.
