# Positions observer quality review

Reviewed September 12, 2026 against initial implementation `2f3704aac23c31f78ad446c66c12c43ef7216de6` and final code commit `1ea39a23f803d8a44784c0883f32d842ed07d41d`.
Final disposition: accepted for the bounded local observer library, with no unresolved critical findings in that scope.
Documentation follow-up `a214b23` was also inspected.
The reviewer owns only this report and made no implementation changes, live transactions, browser changes, or server changes.
The store adapter and read-only verifier were initially uncommitted and are included in the reviewed final code commit.
The initial findings below remain as a record of the reproductions and acceptance criteria; the final verification section records their resolution.

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
The following final verification supersedes the initial pending status.


## Final verification and acceptance

The reviewer inspected code commit `1ea39a23f803d8a44784c0883f32d842ed07d41d` and documentation commit `a214b23`.
The reviewed position modules and tests matched the committed code when the final checks ran.
All initial findings are resolved within the bounded local-library scope.

The observer now rechecks the retained checkpoint before publishing the new chunk.
An independent regression reproduced the original race, verified unavailable health with no checkpoint advance, then verified that the next canonical replay removed the orphaned event.
Attribution requires matching observation and reconciliation chain and block hash, validates baseline maker and chain, and checks transfer-audit interval identities and hashes.
Reconciliation checks the baseline's canonical hash before and after the snapshot reads.
Missing or mismatched audit evidence prevents known attribution.
The documentation explicitly requires trusted server-side audit evidence and rejects a client assertion of completeness as sufficient evidence.
The optional atBlock reconciliation mode produces matching finalized snapshots while default reads remain at head.

The observer enforces 10,000 input logs and retained events and a 4 MiB serialized event-history limit.
These are implementation capacity limits, not measured production throughput claims.
Exceeding capacity returns limited health and history_limit without advancing the cursor or persisting partial history.
The committed event-count regression passed.
An independent oversized Shipped fixture also verified byte-limit refusal with no history or checkpoint publication.
Paged storage remains necessary for larger histories; the current implementation makes that boundary explicit and fails closed.
The added checks preserve focused modules and do not require another file split.

The final focused suite passed all 18 tests, and scoped ESLint passed.
The reviewer independently exercised simultaneous observeChain calls against the actual ManagedStore adapter.
One writer succeeded, the other received a revision conflict, a fresh retry succeeded, and another owner's read remained empty.
The API caller remains responsible for bounded conflict retry or request coalescing.

The reviewer independently ran the read-only live command on September 11, 2026 at 20:12:53-55 UTC.
All three chains decoded two existing Shipped events, returned current backing reads for both positions, and recovered confirmed registration receipts.
The current read blocks were 504161059 on Arbitrum, 121323879 on BNB Chain, and 60530077 on Robinhood Chain.
Historical coverage correctly remained backfilling because the command intentionally indexed only the registration block.
This evidence supports deployed registration decoding and current backing reads, not complete fill history or resolver participation.

Full frontend `npx tsc --noEmit` was also run during final review.
It reported `maxFeeWei` missing from DevWalletReview at `lib/server/dev-wallet/baskets.ts:52` and `lib/server/dev-wallet/managed.ts:81` in concurrently edited files outside this ownership.
The reviewer sent those failures to the coordinator for the dev-wallet owner to fix.
No position-module type errors were reported by that run.
This scoped acceptance is not a claim that the whole workspace typecheck passed.

Product API authentication, UI behavior, production history storage, a real complete transfer-audit producer, and credential-fixtured fork fills remain integration acceptance work outside this library review.
Until the server has verified external-activity coverage, attributable amounts must remain unknown or use explicitly reviewed user-selected amounts.
No live transaction, browser session, or active server was changed during this review.
