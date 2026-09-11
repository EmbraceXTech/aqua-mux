# Managed automation and API implementation results

Prepared September 12, 2026.
This report covers the automation/API worker scope, not acceptance of every product phase.

## Ownership and integration

Owned code is under `apps/frontend/lib/server/automation`, `apps/frontend/lib/server/managed-service`, `apps/frontend/lib/server/payments`, and `apps/frontend/app/api/managed`.
The focused tests are `automation-lease`, `automation-review`, `managed-api-http`, `managed-execution`, `managed-freshness`, `managed-runner-http`, and `managed-token-resolution` under `apps/frontend/test`.
Core schemas, SQLite migrations, wallet authentication, lifecycle compilation, simulation/signing, observer, token registry, runner process, and browser UI have separate workers and reviews.
No pre-existing dirty files or generated files were committed by this worker.

Commits `0263964`, `4e829e5`, and `5a07a89` contain the initial lease/client, durable orchestration, and restart/price corrections.
Commit `55e5a34` and the API-owned paths recorded in shared commit `6516583` add source freshness and full token registry integration.
Independent quality review is recorded in `automation-api-quality-review.md`.

## Implemented behavior

The API authenticates every group, review, plan, attempt, and history operation against its owner.
Only the public catalog is unauthenticated.
SQLite retains groups, bots, reviews, plans, attempts, source snapshots, idempotency records, and exact execution lock fences.
The shared database unique index permits one nonclosed managed group per maker and chain.

A browser owns a 45-second lease using server time.
Takeover increments the run generation and invalidates earlier review results.
Each due request runs one fresh review, and missed intervals coalesce into the next request rather than a backlog.
A liveness watcher exists only during an already-running request and cancels that request after stop, generation change, or lease loss.
There is no timer that starts reviews or trades after the browser disconnects.
Timeout, exhausted development quota, unavailable backing, stale wallet data, and expired route evidence produce failed or cancelled records without plans.
An expired pending review becomes cancelled on an identical retry after SQLite reopen without rerunning inference.

Initial proposals read actual wallet balances and allowances at one RPC block and obtain live route observations when available.
Known managed positions receive fresh backing reconciliation before recurring reviews.
Unregistered external exposure and resolver discovery remain explicitly incomplete.
New token selections, including fallback assets, require current registry selection and on-chain metadata verification.
The metadata cache has a fixed entry limit and removes expired entries.
Previously stored token metadata can be rechecked on-chain for recovery without requiring the registry provider.
Amounts remain integer strings, and deterministic compilation derives executable LP opening prices before confirmation.

Plans use the lifecycle worker's fresh snapshot, validated route, and whole-batch simulation adapters.
The exact plan digest binds confirmation, configuration, policy, snapshot, calls, minimum receipts, and expiry.
Owner-scoped route records retain the verified request/result and plan digest for signer policy validation.
Editing configuration invalidates the run generation and previous execution confirmation.
Close-only planning does not invoke the agent or a swap route.
Stop leaves passive positions open and returns outstanding prepared, submitted, or unknown attempts.

Preparing an execution reserves the maker/chain lock until explicit rejection, a definite failure before submission, or receipt reconciliation.
The signing guard still checks the lock's server-time expiry, plan digest, generation, and required browser lease.
The dev signer journals its hash and nonce before broadcasting.
An ambiguous submission keeps its durable lock across restarts.
External wallets can report their batch ID and later discover a receipt hash through `wallet_getCallsStatus`.
A client status report is never confirmation by itself.
The server independently checks canonical receipts and exact batch calldata, or successful account child calls from an RPC call trace.
Unsupported tracing, multiple unproven receipts, and unavailable transaction data remain unknown with the lock retained.
An explicit wallet rejection code 4001 can release only a prepared attempt with no submitted identifiers and removes its plan authorization.

Delegated Privy execution remains disabled by the shared capability gate.
This worker added no privileged signing path.
The development ReviewService entitlement is uncharged and separate from transaction authorization.
Cumulative spend, action count, cooldown, gas budget, and trigger fields that lack complete enforcement are labelled advisory in generated proposals.
There is no Hedera payment claim.

## API contract

All paths below are prefixed with `/api/managed`.
Mutation bodies are bounded JSON, bearer authentication is required, and the shared authentication service checks the request origin.
Errors use `{code,error}` with sanitized provider failures.

| Route | Request or result |
| --- | --- |
| `GET /catalog` | Catalog, capability gates, lease timeout, uncharged service label. |
| `GET /groups` | Owner groups and bots. |
| `POST /groups` | `{config,mode}` creates a manual group and idle bot. |
| `POST /proposals` | `{idempotencyKey,intent}` reads wallet data and returns a persisted review, with a group only when configuration validation succeeds. |
| `GET /groups/:id` | Group, bot, reviews, plans, strategies, transactions, movements, payments, and saved observation. |
| `PATCH /groups/:id` | `{config}` invalidates the previous run. |
| `POST /groups/:id/bot` | `{action,sessionId,generation?}` with start, resume, stop, heartbeat, or takeover. |
| `POST /groups/:id/reviews` | `{idempotencyKey,sessionId,generation}` starts one due interval review. |
| `POST /groups/:id/proposals` | `{idempotencyKey}` requests an explicit group proposal. |
| `POST /groups/:id/plans` | `{reviewId?,action,targetToken?,unwrap?,sessionId?,generation?,inventory?}` returns `{plan,digest}`. |
| `POST /groups/:id/plans/:planId/confirm` | `{digest,sessionId?,generation?}` confirms the exact stored plan. |
| `POST /groups/:id/attempts` | `{planId,idempotencyKey,sessionId?,generation?}` prepares external wallet execution. |
| `POST /groups/:id/attempts/:attemptId/submitted` | Records a transaction hash or wallet batch ID. |
| `POST /groups/:id/attempts/:attemptId/wallet-status` | Reports a matching wallet batch and discovered transaction hashes for independent RPC reconciliation. |
| `POST /groups/:id/attempts/:attemptId/rejected` | `{code:4001}` records explicit rejection before submission. |
| `POST /groups/:id/attempts/:attemptId/not-sent` | Records an explicit preflight or workspace change before invoking the wallet. |
| `POST /groups/:id/reconcile` | Reconciles submitted attempts and refreshes known position observations. |

The runner client sends authenticated `POST /reviews` requests with the same request ID in `Idempotency-Key`.
It validates the shared result schema, response identity, bounded body size, and sanitized error states.
Cancellation uses `DELETE /reviews/:requestId`, while generation fencing remains authoritative if remote cancellation is unavailable.

## Validation and limits

The focused suite passes 22 tests, including actual local HTTP requests with wallet-signature authentication, two-tab fencing, duplicate group refusal, owner isolation, review idempotency, SQLite reopen, stop during model execution, timeout, quota, source age, transaction locking, external status updates, and dynamic token metadata checks.
The suite uses labelled deterministic provider and chain fixtures and does not claim real asset movement.
TypeScript and scoped ESLint passed after the final implementation edits.
The HTTP route/session test uses a real local HTTP server and generated test wallet proof.

A live Next request to port 33127 returned the four-entry catalog with HTTP 200.
A plain curl private request without browser origin metadata was refused by the origin guard.
With the browser Origin and Sec-Fetch-Site headers, the private endpoint returned the expected authentication-required response.
This is not a successful live authenticated browser workflow claim.
The real runner, fork lifecycle, dev signer, registry, and browser evidence belong to their respective worker reports.

RPC history indexing requires an explicit `AQUAMUX_START_BLOCK_<chainId>` value.
Without it the API preserves incomplete history instead of manufacturing zero activity.
`AQUAMUX_CONFIRMATIONS_<chainId>` controls receipt reconciliation and defaults to one subsequent block; it is recorded with the receipt result.
No guarantee is made for wallet encodings or RPC tracing that have not passed a real compatibility test.
