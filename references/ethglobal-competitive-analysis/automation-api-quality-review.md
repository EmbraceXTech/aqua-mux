# Automation and managed API quality review

This independent review covers `apps/frontend/lib/server/automation/`, `managed-service/`, `payments/`, and `app/api/managed/`.
The implementation owner is dispatch `ctx_54af0d1cd065`.
The reviewer owns this report only and did not edit implementation files.

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
