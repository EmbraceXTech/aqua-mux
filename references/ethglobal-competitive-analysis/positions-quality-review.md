# Positions observer quality review

Reviewed September 12, 2026 against implementation commit `2f3704aac23c31f78ad446c66c12c43ef7216de6`.
The reviewer owns only this report and made no implementation changes, live transactions, browser changes, or server changes.
The store adapter and read-only verifier were still uncommitted when first inspected.
Final acceptance requires the coordinator to identify the follow-up commit and route the fixes through this review.

## Initial verdict

Changes required before accepting the observer as a source of canonical history or known attributable inventory.
The module boundaries are appropriate, but the tests omit a reorg between retained-history validation and new-chunk anchoring, and attribution does not validate enough snapshot provenance.
Ordinary observation and reconciliation calls also cannot produce the matching heights required by attribution.

## Findings

### P1: A reorg can permanently retain orphaned history

Location: `apps/frontend/lib/server/positions/observer.ts:55-80` and `observer.ts:101-111` in commit `2f3704a`.
The observer validates the old checkpoint before it obtains the new chunk anchor.
A reorg after that first validation lets the new anchor and chunk belong to a different fork while the old events remain in the merged history.
The final check verifies only the new anchor.
Later calls validate the new checkpoint, so they cannot detect the orphaned prefix.

Reproduction used the public `observeChain` entry point with an injected `PositionRpc`.
Index a Shipped event at block 10 and checkpoint 19 on fork 0.
On the next call, return fork 0 for the first checkpoint-19 read, then switch all responses to fork 1 when block 20 is requested.
The function returns `health: current`, a fork-1 checkpoint at block 20, and the fork-0 event from block 10.
This is a confirmed failure, not a hypothetical missing test.

Acceptance requires validation of the retained checkpoint after the new chunk has been anchored and read, with no publication of mixed-fork history.
Add a regression that reproduces this exact sequence and proves recovery removes the orphaned event.

### P1: Attribution accepts incompatible snapshot provenance

Location: `apps/frontend/lib/server/positions/inventory.ts:6-10` and `inventory.ts:51-60` in commit `2f3704a`.
The coverage check compares heights but omits the observation checkpoint hash, observation chain, and an upper bound on the baseline block.
A baseline has no chain, maker, or block hash identity of its own.
The external-activity flag is an asserted string without an audit interval.

Reproduction started with an empty current observation through block 10, a block-10 reconciliation with wallet balance 100, and an allocation of 60 at baseline block 9.
Each independent mutation below still returned `attribution: known` and `attributableAmount: 60`:

- Change the observation checkpoint hash to another fork while retaining block number 10.
- Change the observation configuration chain ID from 42161 to 1.
- Move the baseline block from 9 to 100, beyond the reconciled snapshot.

Acceptance requires matching chain and block hash provenance, a validated baseline at or before the snapshot, and a baseline/audit identity bound to the maker, chain, and covered interval.
At minimum the confirmed mismatches must return ambiguous attribution or reject the input.
The trusted caller contract must state how baseline canonicality and complete external-transfer coverage are established.
A matching final wallet balance alone does not establish an absence of offsetting external deposits and withdrawals.

### P2: Normal current reads cannot satisfy attribution coverage

Location: `apps/frontend/lib/server/positions/observer.ts:52-54`, `reconcile.ts:52`, and `inventory.ts:59` in commit `2f3704a`.
Observation stops at head minus confirmations, while reconciliation always reads head.
Attribution requires exactly equal heights.
With an RPC head of 12 and two confirmations, the actual entry points produce heights 10 and 12 and return `incomplete_observation` even with complete history and unchanged inventory.
The existing successful attribution test hides this mismatch by giving observation an RPC head of 12 and reconciliation a different head of 10.

Acceptance requires a supported block-pinned reconciliation path for the observer checkpoint, including its expected hash.
Keep fresh head reads available for submission checks.
Add a test using one consistent RPC head that obtains known attribution through the supported finalized-snapshot path.

## Module boundaries and conventions

The initial implementation splits decoding, observation, reconciliation, history, attribution, transaction recovery, and the RPC adapter into focused modules of 14 to 135 lines.
No component split or generic framework extraction is needed.
The RPC adapter accepts a public client and has no signing or submission methods.
Reconciliation deduplicates maker/token wallet reads while preserving independent strategy virtual balances.
Unknown balances remain null, and the inventory upper bound is distinct from registration and resolver discovery.
Fill counts and Aqua movement deltas remain separate, avoiding double counting of Swap amounts.
Performance and fee decomposition correctly remain unknown.

The ABI signatures, argument order, non-indexed event fields, and rawBalances outputs match the installed Aqua SDK 0.3.1 and SwapVM SDK 0.4.1 declarations inspected locally.
The Shipped decoder test uses the installed SDK ABI.
The synthetic Pushed and Swapped fixtures repeat local ABI definitions, so they do not independently prove deployed fill decoding.
The incoming read-only verifier can establish deployed Shipped decoding and current rawBalances reads, but it does not establish observed live fills or both-direction fill behavior.

## Storage and owner isolation

The incoming `positions/store.ts` delegates persistence to the common SQLite document store instead of adding another database implementation.
The document store keys data by namespace, observation key, and normalized owner address.
Its synchronous transaction compares the expected revision and atomically replaces the observation document.
The adapter test passed restart persistence, another owner's empty read, and stale-revision rejection without checkpoint rollback.
The base history helper filters positions by owner and group before matching chain, maker, app, and strategy hash.
These are sound local boundaries; authenticated route wiring is outside the initial commit and still needs integration evidence.

The observation stores every event for both configured contracts in one JSON document per owner.
Each chunk clones, merges, sorts, serializes, and rewrites the entire retained history.
A bounded block chunk does not bound total memory, document size, or write cost.
For an initial bounded-history read-only demonstration this is an explicit limitation.
Before long-running multi-owner production use, require paged event storage with a shared chain cursor or another design that bounds work per chunk and avoids copying full public history for every owner.
Concurrent callers also need a documented conflict retry or coalescing policy, since the observer propagates repository revision conflicts.

## Verification evidence

The initial focused command passed all 11 tests:

```sh
cd apps/frontend
npx tsx --test test/positions-observer.test.ts test/positions-reconcile.test.ts
```

After the adapter appeared, the same suites plus `test/positions-store.test.ts` passed all 12 tests.
Focused ESLint passed for `lib/server/positions` and the observer, reconciliation, fixture, store, and live-read test files.
The SQLite test emitted Node's experimental SQLite warning but no test failure.
The reviewer also ran `/tmp/positions-quality-repro.mts` against the public observation, reconciliation, and attribution entry points.
It asserted and printed all five reproduced outcomes described above.
That temporary script is diagnostic evidence, not a committed implementation artifact.

Browser testing was not used because this deliverable exposes library entry points and the task forbids modifying the active browser/server.
No live transaction was submitted.
Live read evidence and final follow-up commit review remain pending.
