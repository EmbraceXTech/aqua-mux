# Managed strategy core results

Implemented September 12, 2026, in the shared AquaMux checkout.
This report covers the versioned contracts, local durable storage, and wallet ownership foundation.
It does not establish completed UI, runner, live execution, or delegated-signing acceptance.

## Ownership and commits

The worker owns new files under `apps/frontend/lib/managed`, `apps/frontend/lib/server/store`, and `apps/frontend/lib/server/auth`, plus the auth routes and `managed-*` tests.
Existing Basket validation, config, strategy compiler, wallet code, generated files, and unrelated dirty work were preserved.
No package or lockfile change was needed.

| Commit | Deliverable |
| --- | --- |
| `f3c73d2` | Versioned strategy, policy, review, lifecycle, and durable record contracts. |
| `670e64d` | SQLite migrations, records, history, documents, idempotency, and fenced execution locks. |
| `b17cfc6` | Persistent wallet challenges, bearer sessions, and auth routes. |
| `1b63154` | Review corrections for shared metadata, registration vectors, native-value encoding, and login availability, with HTTP coverage. |

## Shared contracts

Import browser-safe schemas and types from `apps/frontend/lib/managed/index.ts`.
`StrategyConfig` is a version 1 discriminated LP/MM union, with a separate recipe version.
LP supports one to six distinct economic pairs, individual fees, integer reserve amounts, full or bounded ranges, and optional maker-program expiry.
Prices are rational human quote-per-base values with explicit token addresses.
`rawPriceRatio` converts token decimals with integer arithmetic and does not reorder the economic denomination.
All timestamps use Unix milliseconds; the compiler must convert program expiry to the deployed program's units.
Shared token metadata must agree across pair and spend-budget references.

`ManagementPolicy` records interval, cooldown, count, spending, gas, assets, routes, slippage, source age, expiry, actions, and triggers.
Each field states its enforcement location.
These labels describe the required enforcement contract and do not themselves execute a wallet or on-chain policy.
`requiresPolicyAuthorization` conservatively requires new consent for any changed policy.

`ReviewResult` accepts only hold, fund-and-open, replace, close, or propose-conversion.
It carries rationale, source coverage, proposed configuration, effects, and uncertainties.
Opening and replacement results require a proposed configuration.
Freshness, current authorized asset membership, and execution permission must still be checked by the consuming review service and broker.

`LifecyclePlan` binds owner, maker, chain, configuration/snapshot/policy digests, generation, ordered calls, inventory, registrations, retirements, gas, minimum receipts, simulation provenance, and expiry.
Registration token and amount vectors must agree and tokens must be unique.
`canonicalDigest` hashes stable JSON; `planDigest` excludes the mutable authorization envelope.
Native values use canonical RPC quantity hex, while calldata uses byte hex.

The catalog keeps directional MM disabled because the installed Aqua instruction set and tested deployed routers do not support LimitSwap.
Privy remains disabled because authenticated allowed/refused/expired/revoked/owner-recovery tests have not passed.
These reasons come from `delegation-mm-spike-results.md`.
Concentrated and upward-only LP recipes remain experimental and require broker checks and owner-confirmed plans.

## Storage and integration

`new ManagedStore(path)` opens a local authoritative SQLite database.
`openManagedStore()` returns the process singleton, using `AQUAMUX_DB_PATH` or `.data/managed.sqlite` relative to the server working directory.
Node 22.23.2 was tested with built-in `node:sqlite`; Node reports the module as experimental.
The database enables WAL, full synchronization, a busy timeout, and schema version 1 migrations.
Future schema versions are refused.
The database file is created with owner-only permissions.
A hosted frontend must use a persistent backend service; this database is not a serverless storage solution.

The public facade composes focused record, document, and lock repositories over one database.
`transaction(callback)` is synchronous and supports nested savepoints.
`get(kind,id,owner)`, `list(kind,owner,groupId?)`, `put(kind,record,owner,options?)`, and `revision(kind,id,owner)` enforce owner scope.
Child records require an owned parent group and matching linked bot, plan, or review where applicable.
One nonclosed group can reserve a maker/chain combination.
`put` supports expected revisions and payload-bound idempotency keys.
Each successful record change appends a durable event in the same transaction.

`getDocument<T>(namespace,id,owner)` returns `{id,revision,data}` or null.
`putDocument(namespace,id,owner,data,expectedRevision?)` provides atomic compare-and-swap for observer checkpoints and other internal service state.
Internal documents are never part of user exports.

`acquireExecutionLock(chainId,maker,owner,holder,ttlMs)` returns a fencing token.
A maker other than the authenticated owner requires an owned active group.
`markExecutionUnresolved` persists the prebroadcast boundary; unresolved locks cannot be stolen after expiry or process restart.
`assertExecutionLock(lock,{allowUnresolved:true})` permits the exact fenced prebroadcast recheck after journaling, while still checking expiry.
The caller must also recheck generation, browser lease, owner session, and the corresponding attempt.
`releaseExecutionLock` must only follow reconciliation of the attempt, including ambiguous broadcasts.

`history(owner,groupId?)` returns owner-scoped durable events.
`exportOwner(owner)` excludes internal auth/documents/idempotency state and removes raw execution data, credentials, signatures, receipts, and snapshots.
The export is a redacted activity record, not a restorable signing backup.

## Wallet ownership API

The server exports `WalletAuth`, `walletAuth()`, `requireOwner(request)`, and `requireOwnerSession(request)` from `lib/server/auth`.
A successful owner lookup returns `{owner,sessionId,expiresAt}`.
`AQUAMUX_AUTH_ORIGIN` must match the exact served origin; the default is `http://127.0.0.1:3100`.
The assigned development UI port requires `http://127.0.0.1:33127` instead.
Nonlocal HTTP origins are rejected.

| Route | Request | Response |
| --- | --- | --- |
| `POST /api/auth/challenge` | `{owner,chainId}` | `{id,message,expiresAt}` |
| `POST /api/auth/verify` | `{id,signature}` | `{token,owner,sessionId,expiresAt}` |
| `POST /api/auth/logout` | Bearer session | `{revoked:true}` |

Wallet challenges bind origin, address, chain, nonce, issue time, expiry, and request ID in the signed message.
Proof verification supports EOA signatures; ERC-1271 contract-wallet authentication has not been implemented or claimed.
Challenges expire after five minutes and are consumed atomically once, including concurrent verification requests.
Bearer sessions expire after eight hours and only their SHA-256 hashes are stored.
Mutation requests require the exact Origin and bearer session; owner-authenticated reads validate the request URL and any supplied Origin.
The authentication routes return no-store responses and generic invalid-request errors without echoing request material.
Publicly claimed wallet addresses are never used for issuance quotas, preventing a small unauthenticated batch from exhausting another wallet's login slots.
This is a private local prototype; hosted exposure requires trusted ingress abuse controls.

## Validation and review

From `apps/frontend`, `npx tsx --test test/managed-*.test.ts` passed all 17 tests.
The suite covers schema versions, one-pair LP, independent fees, denomination, integer precision, shared metadata, registration vectors, capability refusal, owner isolation, restart persistence, migration refusal, compare-and-swap, rollback, idempotency, lock fencing, export isolation, proof replay, wrong signer, origin, expiry, logout, and challenge availability.
The HTTP test serves the actual auth route handlers through a local HTTP server and signs the returned challenge with a generated test wallet.
It is an HTTP integration test, not a claim of browser-extension wallet compatibility.

`npx eslint lib/managed lib/server/store lib/server/auth app/api/auth test/managed-*.ts --max-warnings=0` passed.
`npx tsc --noEmit --incremental false` passed for the full frontend at the validation checkpoint.

The coordinator assigned separate reviewer dispatch `ctx_7a7b93b6775b`.
That reviewer confirmed the focused store composition and persistence tests, and requested the metadata/vector and login-availability fixes included in `1b63154`.
The coordinator confirmed independent acceptance of `1b63154` after the reviewer reran all 17 tests, scoped lint, and full frontend typechecking.
The accepted scope is the private local prototype.
Downstream UI, lifecycle, observation, automation, and signing workers received the exact contract and storage/auth imports through Orca before integration.
