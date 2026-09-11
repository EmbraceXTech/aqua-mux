# Implementation task map

Prepared September 12, 2026 against commit `427a4ec8dd063bcbbbaef870b20ec7a709b119a5` and the existing uncommitted pair-chart changes.
This map decomposes the complete agent-assisted LP and MM implementation plan into worker ownership boundaries.
It does not release any feature before its acceptance gate.

## Current worker ownership

| Worker | Owned files | Deliverable |
| --- | --- | --- |
| Development baseline | New `apps/frontend/playwright.baseline.config.ts`, this report, `dev-baseline-results.md`, baseline evidence | Reproducible browser loop, exact failures, preserved working state, implementation boundaries. |
| Runtime spike | `apps/agent-runner/`, `runtime-spike-results.md` | Tested provider versions, subscription authentication, structured streaming, cancellation, timeout, restart, isolation and adapter decision. |
| Delegation and MM compatibility | `delegation-mm-spike-results.md` | Privy feasibility and credentials gap, nested batch policy requirements, installed and deployed MM instruction compatibility. |

The coordinator dispatches and reviews evidence, while Codex Orca workers implement changes.
Use `gpt-6-astra` with medium reasoning for implementation unless a task states otherwise.
Assign README updates separately to `gpt-5.6-luna` after verified implementation results exist.

## Preserve the starting work

The starting tracked diff has 593 added and 73 removed lines across nine files.
It contains pair-specific ranges and charts, token/network presentation, planner/compiler changes and associated tests.
The full path inventory is in the baseline report.
Do not stash, reset, clean, overwrite or commit those edits as part of another worker's work.

The lowest-conflict option is the current shared checkout with exclusive file ownership and separate new modules.
Integration workers must inspect the current diff before touching an existing file and commit only their own changes.
Avoid broad staging commands, global formatting and concurrent edits to package manifests or lockfiles.
An existing dirty file requires explicit coordination of its diff and commit attribution before its integration commit.

For separate Orca branches, create each worktree with an explicit base ref that includes the required completed worker commits.
Do not assume a new Git worktree inherits uncommitted changes.
Before branch creation, retain a binary tracked patch and a manifest with hashes of the original tracked and untracked task inputs in a private local directory.
Copy only the enumerated chart source, tests and network asset into the new worktree, then apply the tracked patch with `git apply --check` followed by `git apply`.
Exclude `.env`, signing material, node_modules, build output, `.DS_Store` and other workers' files.
Keep that overlay uncommitted and record its hash beside the branch base SHA.
Run the baseline against the overlay before implementation and compare it again before integration.
Cherry-pick only owned commits and inspect the resulting diff against the preserved overlay.
If branches must have a clean committed baseline, the coordinator must first resolve ownership of the existing diff with the user rather than silently absorbing it.

## Runtime gate and shared contracts

Product implementation waits for the runtime spike report and an explicit coordinator gate decision.
A failed preferred adapter must yield a documented compatibility gap and an approved narrow fallback decision, not an unreported change to API-key inference.
Privy failure blocks delegated automation but can leave the external-wallet, user-confirmed LP path available.

After the runtime gate, assign the contract worker first and freeze the following runtime-validated interfaces before consumers integrate.
Store quantities as integer strings and require metadata for prices and tokens.

| Contract | Required fields and invariant |
| --- | --- |
| `StrategyConfigV1` | Recipe ID/version, distinct LP or MM kind, owner, maker, chain, token metadata, managed budget, gas reserve, explicit price denomination, per-pair settings and management policy. |
| `ChainSnapshotV1` | Snapshot ID, chain/block/hash/time, maker, real balances, allowances, registered strategies, virtual balances, observed coverage and stale/missing flags. |
| `ReviewRequestV1` | Owner, group ID, request/idempotency key, configuration digest, snapshot ID, run generation, browser lease ID and review intent. |
| `ReviewResultV1` | Decision enum, supported configuration patch, rationale, evidence references, uncertainty, runtime version, usage, completion/error state and request ID. |
| `LifecyclePlanV1` | Plan ID, operation, owner/maker/chain, configuration and snapshot digests, generation, ordered calls, minimum receipts, expected inventory, expiry and required confirmation/policy outcome. |
| `TransactionAttemptV1` | Plan and idempotency IDs, wallet batch/provider ID, optional hash and nonce, submitted/confirmed/reverted/unknown state, receipt and reconciliation timestamp. |
| `ReviewStreamEventV1` | Version, request ID, monotonic sequence, event kind, public payload and terminal success/failure/cancelled event. |

Keep the current `Basket`, `Plan`, `Call`, `submitPlan` and `batchStatus` contracts intact for the existing basket flow.
Add adapters at explicit boundaries rather than forcing single-pair LP or MM through the two-to-six-leg basket schema.
The agent returns proposals and tool requests only.
The deterministic planner owns calldata and call ordering, and the executor owns authorization and submission.

## Implementation waves

| Task | Exclusive implementation area | Dependencies | Acceptance evidence |
| --- | --- | --- | --- |
| C1: contracts and persistence | New `lib/managed/`, `lib/server/store/`, database migrations and ownership-auth module | Runtime gate | Schema rejection, migrations/restart persistence, cross-owner denial, integer serialization and idempotency. |
| L1: manual lifecycle planner | New `lib/server/lifecycle/`, LP compiler module and related tests | C1 contracts | Inventory reuse, shortage funding, conservative minimum reserves, disjoint shared budget, fresh hashes, close-only and close-and-convert. |
| U1: managed workspace | New `components/managed/`, managed styles, catalog and proposal UI | C1 contracts; integrate L1 later | Selection, editable proposal invalidation, truthful unavailable states, manual confirmation, in-app positions/activity and responsive layout. |
| R1: authenticated review service | `apps/agent-runner/`, runner client adapter and review API routes | Runtime spike and C1 | Authenticated request, isolated tools, cancellation/timeout/restart, durable usage, validated output and uncharged entitlement. |
| O1: chain observer | New `lib/server/positions/`, read APIs and event tests | C1; coordinate L1 instance metadata | Actual ABI events, block coverage/hash, reorg/dedup/backfill, shared inventory, resolver fill attribution and unknown fee components. |
| A1: browser management | New `lib/server/automation/`, lease API routes and lease client hook | C1 and R1; U1 controls | Single-tab lease, server-time expiry, generation invalidation, due-review coalescing, stopped late-result refusal and submitted-transaction recovery. |
| I1: integration | Sole owner of `components/aquamux.tsx`, route composition and existing-file adaptations | L1/U1/R1/O1 interfaces | Complete manual workflow with no essential external Portfolio handoff and no loss of current basket/chart behavior. |
| V1: fork and live proof | `scripts/verify-fork.ts`, `scripts/live-e2e.ts`, `scripts/verify-live-state.ts`, focused integration fixtures | L1/O1/I1 | Fix fixture path and range schema, prove rollback, both fill directions, sibling backing, replacement, exit and residual read-back. |
| D1: delegated execution | Executor adapter and policy integration | Separate Privy spike passes, C1/L1/A1 | Allowed later batch without signature, harmful nested call refusal, spend/receiver/delegate target checks, expiry/revocation and owner recovery. |
| M1: market making | Distinct MM compiler and recipe module | MM compatibility gate, O1/A1 | Buy/sell and partial fills, inventory exhaustion, crossed quote rejection, expiry, cancellation, disconnect behavior and attributed costs. |
| P1: paid reviews | Payment service and entitlement adapter | Deferred provider/payment gate | Real Blocky402 Hedera request, verified settlement, request binding, idempotency and failed-run refund/credit policy. |
| DOC1: README | Root README only, separate luna worker | Verified feature evidence | Exact setup steps, supported modes and chains, known limitations, links to reproducible results. |

Limit each dispatch to a bounded slice of the table rather than one worker owning an entire phase indefinitely.
Use at most the available worker slots and sequence shared-file integration after independent modules land.
The baseline config is separate from the existing Playwright config so a feature worker can adopt it without overwriting prior tests.

## Gates that remain closed

The phase 0 fork run currently reproduces the schema failure and therefore does not prove the complete fork lifecycle.
The missing fixture path must also be fixed by V1 before the normal command is portable.
Default Turbopack startup has a font resolution failure; the baseline uses Webpack, and the later environment/build owner must investigate production build behavior before release.

Phase 1 requires one funding asset to two pairs, observed fill, replacement, conversion, residual reconciliation and independently usable close-only behavior during route outage.
Phase 2 requires stop during execution, reload, sleep, two tabs, stale data and quota scenarios.
Phase 3 remains disabled for every wallet/chain combination without permission and revocation evidence.
Phase 4 remains disabled until the deployed instruction and resolver requirements have been demonstrated.
Phase 5 remains deferred and must not charge users or claim a Hedera prize-qualified flow before a real paid request succeeds.

Assign exactly one transaction executor for all real BNB, Robinhood and Arbitrum writes using the authorized key.
That executor owns nonce allocation, pending-transaction reconciliation, receipt recording and cleanup.
Other workers may build deterministic plans and run isolated local forks, but they must not race live transactions or expose credential values.
Do not claim a mock wallet test, successful registration or old receipt proves present resolver discovery or delegated support.
