# Automation and managed API quality review

This independent review covers `apps/frontend/lib/server/automation/`, `managed-service/`, `payments/`, and `app/api/managed/`.
The implementation owner is dispatch `ctx_54af0d1cd065`.
The reviewer owns this report only and did not edit implementation files.

## Acceptance

Accepted for the reviewed manual-execution API and browser-review scope at `645c892bce30b8cafeb59fe75666ab190aa94c0e`.
All blocking findings in that committed scope are resolved.
The final isolated snapshot passes 33 focused tests, scoped lint and formatting, and the full frontend typecheck.
This acceptance does not cover subsequent uncommitted integration changes or establish live wallet compatibility.

## Initial review status

Changes are required before acceptance.
The initial committed baseline is `0263964ce95bbc7d625367ce04b20f24166ac30a`.
The API, review orchestration, and execution files were uncommitted when inspected on September 12, 2026.
Acceptance requires the owner's exact final commit and verification of the repaired files.

## Findings requiring repair

1. Prepared attempts can permanently prevent Resume after a wallet rejection, lost response, or reload before submission.
   `prepareManagedExecution` persists `prepared`, while `updateBot` refuses Resume for that status and reconciliation only inspects submitted or unknown attempts with a transaction hash.
   The initial API has no cancellation or resolution endpoint for this state.
   An authenticated API reproduction prepared an attempt, stopped the bot, and received `recovery_required` on Resume.
   Provide a safe distinction between a provably unsent attempt and an ambiguous submission, with restart tests that preserve ambiguous transaction locks.

2. Wallet batch identifiers are accepted without a recovery path.
   The submitted endpoint accepts `walletBatchId` without a hash, but `reconcileManagedTransactions` ignores that attempt and `recordManagedSubmission` rejects later updates with `attempt_submitted`.
   An authenticated reproduction confirmed that the attempt stays submitted and that adding its transaction hash is refused.
   Implement verified batch resolution or reject unsupported execution modes before creating an unusable attempt.

3. Initial proposal completion does not recheck snapshot freshness.
   `proposeIntent` checks its overall deadline after inference, but accepts a wallet snapshot older than the policy reference age and route quotes past their recorded expiration.
   `runGroupReview` already rejects a snapshot that becomes stale during inference.
   Apply equivalent provenance checks to initial proposals and preserve unavailable route evidence without presenting expired observations as current.

4. Policy labels claim enforcement that the reviewed execution code does not implement.
   `proposalPolicy` labels cooldown, maximum actions, spending budgets, and trigger rules as `execution-broker` enforced.
   A repository search found no execution checks for `maxActions`, `cooldownMs`, or `spendBudgets` outside the template.
   Enforce the supported constraints with adversarial tests or label unsupported limits accurately and keep the corresponding capability disabled.
   Owner confirmation alone does not establish automatic enforcement of the displayed policy.

5. Formatting fails for `automation/liveness.ts`, `automation/reviews.ts`, `test/automation-review.test.ts`, and `test/managed-runner-http.test.ts`.
   Run the repository formatter on owned files and repeat the scoped check.

6. An expired pending review remains pending indefinitely on an identical request retry.
   `runGroupReview` returns an existing idempotency record before inspecting the age of a pending review.
   The temporary authenticated API harness seeded a crash-equivalent pending record older than its deadline and confirmed that the identical key still returns pending.
   Terminalize the expired record without repeating inference and test durable restart recovery.

7. Stop acknowledgments omit already-submitted attempts.
   The initial `updateBot` response contains the group and bot but no submitted or unknown transaction list.
   Include outstanding attempts in the acknowledgment as required by the implementation plan.

8. The preliminary concern about multiple nonclosed groups was withdrawn.
   The existing `one_group_per_wallet` SQLite unique index in `store/database.ts` already enforces the chain-and-maker boundary.
   The owner's added HTTP duplicate-creation test returns 409 and passed during repair review.
   No implementation correction was needed for this concern.

## Module organization

The separation between lease transitions, review orchestration, the authenticated runner client, entitlement checks, group mutations, planning, execution journaling, and reconciliation is appropriate.
The Next route is a small adapter to a single HTTP dispatcher.
Keep signing credentials in the wallet execution layer.
The review runner receives configuration and observations rather than wallet credentials.

`plans.ts` combines selection of attributable inventory, repeated pair-amount aggregation, funding quote calculations, lifecycle assembly, and persistence.
Extract the pair-amount aggregation and funding calculations into focused helpers with explicit inputs before expanding this module further.
The two maximum-per-token loops should share one implementation because they encode the same shared-inventory accounting rule.
The compressed liveness module and tests need ordinary repository formatting for reviewability.

## Initial verification evidence

The following focused command passed 20 tests with no failures.

```sh
npx tsx --test test/automation-lease.test.ts test/automation-review.test.ts test/managed-runner-http.test.ts test/managed-auth-http.test.ts test/managed-auth.test.ts test/managed-store.test.ts
```

The tests exercise lease takeover, expiry, due coalescing, persisted review results, idempotent retries, owner isolation, Stop during inference, stale data, quota refusal, wallet proof replay, authentication persistence, runner response validation, and durable lock fencing.
An additional 17 tests passed across `test/lifecycle.test.ts`, `lib/server/dev-wallet/policy.test.ts`, and `lib/server/dev-wallet/signer.test.ts`.
These cover deterministic inventory arithmetic, conservative minimum receipts, simulation refusal, close-only independence from routes, token approvals, signing guards, and journal-before-broadcast behavior under test fixtures.
The frontend typecheck passed with `npx tsc --noEmit --incremental false`.
Scoped ESLint passed.
Scoped Prettier reported the four files listed above.

A separate temporary harness at `/tmp/aquamux-automation-review.ts` called the actual `managedApi` handler using a freshly generated wallet proof and an in-memory store.
It verified unauthorized request rejection, explicit two-tab takeover, stale-heartbeat refusal, and both transaction recovery failures above.
It used a labelled lifecycle fixture solely to prepare the reviewed plan.
It did not call an RPC service, send a transaction, or use a real wallet secret.
Run it from `apps/frontend` with the following command.

```sh
ARBITRUM_RPC_URL=http://127.0.0.1:1 npx tsx /tmp/aquamux-automation-review.ts
```

The first harness run stopped because RPC configuration was absent.
The rerun supplied an unreachable loopback URL, and reconciliation completed without network access because the batch-only attempt was filtered out.

## Verified boundaries and remaining coverage

Lease transitions use server time, explicit takeover advances the generation, and review completion checks the generation and durable wallet-and-chain lock.
Stop and configuration edits cancel the local in-flight review, while periodic checks detect generation changes in other processes.
The runner client requires an authenticated HTTPS or loopback URL, rejects redirects, bounds result size, validates the response identity, and avoids exposing provider error bodies.
The payment interface is explicitly an uncharged development entitlement and does not authorize transactions.

The local wallet adapter calls `assertManagedExecutionCurrent` before signing and again before broadcast through the signer callback.
This is source-level evidence for the integration boundary, not proof of a live delegated signer.
The catalog refuses delegated mode.
No Privy compatibility, paid Hedera request, live inference quality, browser rendering, or successful on-chain execution is established by this review.
Initial proposal freshness, policy enforcement, transaction recovery, and the final committed revision remain the acceptance gates.

## Repair verification checkpoint

Commits `4e829e5621809b498be4ffe74b73d8294c24f644` and `5a07a890b60f9783868662a86869bb4248993193` repair execution recovery, interrupted review retries, policy labels, Stop acknowledgments, and module organization.
The scoped suite now passes 26 tests, including the new managed HTTP and execution tests.
Scoped ESLint, Prettier, and the frontend typecheck pass on these commits.

The independent API harness now verifies explicit wallet rejection followed by successful Resume, batch-hash attachment without trusting a browser confirmation flag, refusal to reject a submitted attempt, and cancellation of expired same-key review retries.
Prepared attempts reserve an unresolved wallet lock until explicit rejection or receipt recovery.
A wallet status response can attach a single transaction hash, but only RPC receipt and exact execution proof can mark the attempt confirmed.
Multiple wallet receipts or unavailable tracing leave the attempt unresolved.
This deliberately limits the supported recovery claim.

A separate local HTTP harness at `/tmp/aquamux-runner-boundary-review.ts` verified oversized-response refusal, redirect refusal, cancellation of a stalled request, and authenticated remote cancellation.
It used a fixture server and no inference-provider credentials.

At this checkpoint, route-quote expiry and matching the initial decision against the allowed-action list still needed correction.
Token registry integration then expanded the review scope.
The final verification below includes these corrections and the token-helper tests.

## Committed revision verification

The reviewed committed revision is `bbeee25aa1010fb9a033c0d98557a2e90a4b2893`, which includes final implementation commit `55e5a342c6e64e26bf19177e47fd9a02456b40ad` and its native-token test follow-up.
An isolated `git archive` of this revision was extracted to `/tmp/aquamux-api-review.tnLmZB` with the existing installed dependencies linked for verification.
This avoided reading half-written files from concurrent planner and UI edits.
All 33 focused tests passed in that snapshot.
Scoped ESLint and Prettier passed, and the complete frontend typecheck passed with incremental output disabled.

```sh
npx tsx --test test/automation-lease.test.ts test/automation-review.test.ts test/managed-runner-http.test.ts test/managed-api-http.test.ts test/managed-execution.test.ts test/managed-auth-http.test.ts test/managed-auth.test.ts test/managed-store.test.ts test/managed-freshness.test.ts test/managed-token-resolution.test.ts
npx tsc --noEmit --incremental false
```

The final independent API harness at `/tmp/aquamux-automation-review-final.ts` also passed against this snapshot.
It used the API's injected metadata dependency to isolate authentication and transaction recovery from network services.
Metadata behavior was checked separately by the token-resolution tests.
The harness made no RPC calls and sent no transactions.

All blocking findings in this committed API scope are resolved.
Initial proposals now enforce wallet and route evidence freshness and the allowed-action list.
Aggregate limits and triggers that have no automatic enforcement are labelled advisory.
Funding calculations and token verification have focused modules.
The verified-token cache has a capacity limit and removes expired entries.
New catalog selections require current selectable registry entries and independent metadata checks.
Stored group metadata can recover without a registry request after decimal verification, including native assets without an ERC20 call.
The tests reject mismatched stored decimals and stale registry authorization.

The shared working tree temporarily failed four execution tests while uncommitted planner changes added route binding.
It also temporarily failed typechecking while the UI token selector was being edited.
Those failures were reported to the coordinator and are not present in the isolated committed snapshot.
The subsequent `plans.ts` follow-up was reviewed separately as described below.

This verification establishes code quality and the tested API boundaries for manual owner-confirmed execution and browser-bound reviews.
It does not establish live delegated execution, paid service settlement, compatibility with every external wallet batch format, or current browser rendering.
Unknown and unsupported transaction outcomes remain unresolved until sufficient independent chain evidence is available.

## Final follow-up and exact acceptance scope

The final accepted revision is `645c892bce30b8cafeb59fe75666ab190aa94c0e`.
Relative to the previously verified snapshot, its only additional API change is `managed-service/plans.ts`.
Close-only planning now reads stored pair and attributable inventory assets without resolving unrelated policy assets through the registry.
When the compiler returns a route digest, the service checks it against the captured route records before persisting the plan.
The captured records remain owner-scoped internal documents.

The isolated archive was updated to this exact revision and all 33 focused tests passed again.
The full frontend typecheck and the changed file's lint and formatting checks also passed.
The other scoped files are unchanged from the preceding clean lint and formatting run.
The current API-owned paths matched this revision when checked before reporting acceptance.

The reviewer accepts the module split, ownership checks, browser lease and generation fences, interruption recovery, honest policy labels, bounded runner client, and tested metadata and transaction-recovery behavior at `645c892bce30b8cafeb59fe75666ab190aa94c0e`.
The broader repository's later planner, signer, UI, and live workflow changes require their own integration evidence.
No implementation files were edited by this reviewer.

The coordinator confirmed final acceptance at `645c892bce30b8cafeb59fe75666ab190aa94c0e`, including the optional route-digest and close-only checks.
Subsequent planner and broader integration changes remain outside this exact revision.
The coordinator lifted the shared-index audit pause after accepting protocol `9fbb3b7`; report commits use its common-directory lock and private-index procedure.
The earlier report-only commits are `7f4453f` and `4c2b201`.

## Backend external execution follow-up

The subsequent external-wallet capability correction is accepted at `7a2f7534ea1b998701258737c1f54c78493c32f9` for its three changed files only.
An authenticated reproduction showed that an arbitrary atomic wallet batch with two receipt hashes could remain submitted with no reconcilable transaction hash and block Resume.
The backend now refuses new external attempts before creating a journal entry or reserving a lock because no verified external adapter is enabled.
Catalog and group responses advertise the same disabled contract, and browser claims cannot override it.
Existing transaction recovery and internal development-signer preparation remain available.

The isolated correction passes five focused HTTP and execution tests, scoped lint and formatting, and an independent authenticated recovery harness.
Its full frontend typecheck exposes an unrelated committed route-policy test overload error, which was reported to the coordinator.
The [managed policy review](managed-policy-quality-review.md) records the exact scope, reproduction, module assessment, and separate replacement acceptance gate.
