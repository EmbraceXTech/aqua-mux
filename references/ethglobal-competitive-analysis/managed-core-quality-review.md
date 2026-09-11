# Managed core quality and security review

Reviewed September 12, 2026.
The reviewer owns only this report and made no implementation changes or live transactions.
The review follows the managed LP implementation plan and the supplied repository instructions.

## Reviewed revisions and verdict

Final verdict: accepted for the private local prototype after correction commit `1b6315449f79376609c7b76c4f0c3d72148b2c06`.
All four findings below are resolved in that commit, and their original evidence remains documented for traceability.
Public hosting still requires trusted ingress abuse controls because challenge creation now has no application rate limit.

| Deliverable | Exact commit | Verdict |
| --- | --- | --- |
| Original managed contracts and schema tests | `f3c73d2b7e3fe8776c9dda8cfe92758b2711f16d` | Superseded by verified corrections below. |
| Durable store and lock tests | `670e64d4e6c22b3e825da871091c0163592c4ced` | Accepted within the persistence scope described below. |
| Original wallet authentication and tests | `b17cfc6d25515fcd15a6738dc51145ff0092e49f` | Superseded by verified correction below. |
| Contract and authentication corrections | `1b6315449f79376609c7b76c4f0c3d72148b2c06` | Accepted for private local use; R1 through R4 closed. |

The shared checkout contains concurrent implementation work.
Findings below distinguish the named committed implementation from inspected integration code and pending fixes.
This review does not establish complete browser lifecycle acceptance, delegated execution, contract-wallet authentication, or live transaction compatibility.

## Findings

### R1: Native call quantities use a byte-string schema

Priority P1.
In `lib/managed/lifecycle.ts`, `calls[].value` uses `hexSchema` from `lib/managed/primitives.ts`.
That schema accepts complete bytes and rejects the JSON-RPC quantity `0x0`.
The managed compiler and lifecycle approval, docking, and unwrapping call builders emit `0x0`.
Consequently, otherwise valid plans fail schema parsing before the user can confirm them.
Direct reproduction against the original schema returned false for `hexSchema.safeParse("0x0").success`.

Use a separate bounded unsigned quantity schema for call values while retaining the byte schema for calldata.
Test zero, odd and even digit quantities, uint256 limits, and invalid empty or negative values through the complete plan schema.
A quantity-schema fix was already present as concurrent uncommitted work when this finding was confirmed.

### R2: Registration token and amount arrays can disagree

Priority P2.
In `lib/managed/lifecycle.ts`, each registration independently requires at least two tokens and two amounts but never checks equal lengths or duplicate tokens.
A registration with two tokens and three amounts passes the original schema.
Persistence treats this schema as the validation boundary, so inconsistent display and accounting metadata can become durable even though downstream ABI construction may reject it.
This is a schema integrity defect, not proof of a transaction authorization bypass.

Require matching array lengths and unique normalized token addresses, with the appropriate maximum token count.
Add regressions for both directions of the mismatch and repeated token addresses.

### R3: Shared tokens can have conflicting metadata across pairs

Priority P2.
In `lib/managed/config.ts`, the cross-pair validation rejects duplicate economic pairs but does not require consistent decimals and symbols for the same token address.
A two-pair configuration sharing a base address passes with 18 decimals in one pair and 6 in the other.
The exact price conversion function then interprets those entries with different powers of ten.

The inspected service's `validateConfigTokens` checks pair metadata against its token catalog, which mitigates the public group creation path.
That service check does not make an inconsistent configuration valid for the exported schema, compiler consumers, or durable records.
Require one metadata definition per normalized address across all pairs and test cross-pair conflicts.

### R4: Unauthenticated callers can exhaust another wallet's login quota

Priority P2.
In `lib/server/auth/wallet-auth.ts`, challenge creation counts unused challenges by the requested owner address and refuses creation after ten challenges.
No wallet proof is required to consume those slots.
An attacker can issue ten requests naming a victim address and cause the victim's next login request to return HTTP 429 until those challenges expire after five minutes.
Checking Origin does not authenticate a direct HTTP client.

The independent reproduction issued ten challenges for the fixture owner, then observed `429 Too many active wallet challenges` on the next call.
Remove the attacker-controlled per-victim exhaustion condition or apply abuse accounting to a trustworthy caller context without exhausting another owner's login capacity.
Add a regression where attacker-issued challenges do not prevent the legitimate wallet from obtaining and completing a challenge.

## Contract and enforcement assessment

The contracts use strict objects and literal version 1 for configuration, recipe, policy, review result, and lifecycle plan formats.
Record formats without their own version currently depend on the SQLite migration version and their enclosing versioned values.
Future record shape changes therefore need a migration rather than silently parsing older records under a changed schema.

Amounts are decimal strings bounded to uint256 and reject fractional, negative, padded, and lossy numeric inputs.
Price comparison uses BigInt cross multiplication and explicit base and quote denominations.
Intermediate rational arithmetic can exceed uint256 safely in JavaScript; compiler encoding must separately bound the final values.
One-pair LP configurations work independently of the existing basket model, and fees and ranges belong to individual pairs.
MM configurations are separate and the capability gate refuses both MM and delegated execution.

Policy fields identify an enforcement location, but the location is declarative metadata rather than evidence that the named layer enforces the limit.
The schema cannot establish route safety, signer permissions, inventory availability, or the validity of a simulation.
Those require deterministic compiler, broker, and wallet checks before submission.
The canonical plan digest includes calls, identity, configuration and snapshot digests, generation, expiry, and simulation metadata while excluding the mutable authorization record.
The inspected execution service compares the confirmation digest against that computed digest.
Approval of the schema does not approve that separate execution service.

## Persistence and recovery assessment

Reads, lists, updates, history, exports, and internal documents scope access by normalized owner.
Record updates cannot replace another owner's record, and children must refer to an owned parent group.
The store checks same-group references for bot, plan, and review links and preserves group maker and chain identity.
The partial unique index permits one nonclosed group per maker and chain.
Authenticating control of the maker is a service responsibility; the inspected group creation service requires the authenticated owner to equal the maker.

Record bodies, revision changes, history entries, and idempotency records share one synchronous transaction.
Idempotency keys bind canonical content, and optional expected revisions provide compare-and-swap updates.
Callers that omit expected revisions must perform their read and update within a transaction to avoid lost updates.
The implementation uses BEGIN IMMEDIATE, nested savepoints, WAL, FULL synchronization, a busy timeout, and transactional migration version changes.
It refuses future schema versions and asynchronous transaction callbacks.
The tests cover rollback and close/reopen recovery, including unresolved execution locks.

Locks identify the chain, maker, owner, holder, and monotonically increasing fence.
An unresolved submission continues to block acquisition after restart until reconciliation releases its fence.
The release function is trusted internal code and does not independently verify a receipt.
Submission callers must durably mark uncertainty before allowing another attempt and must not use the optional unresolved-lock assertion mode to authorize a duplicate broadcast.
Separate integration tests must cover that submission ordering.

Exports omit sessions, challenges, internal documents, raw execution data, and common sensitive fields.
Key-based redaction is not a general detector for secrets embedded in arbitrary prose.
No credentials were printed or exported during this review.

## Authentication assessment

Challenges bind the wallet address, origin, chain, nonce, issue time, and expiration in the signed message.
Verification rechecks challenge consumption and expiry transactionally after signature recovery, preventing concurrent replay from creating multiple sessions.
Sessions use random bearer values and persist only their SHA-256 hashes.
Expiry and revocation are checked on authentication, and sessions survive a database reopen.
Mutation requests require the configured exact origin, and authenticated requests also validate the request URL origin.
Nonlocal authentication origins require HTTPS.
The implementation explicitly supports EOA message recovery; ERC-1271 ownership remains outside this acceptance.

## File split and maintainability

The managed contracts separate primitives, configuration, policy, lifecycle plans, review records, and capabilities into focused modules.
The committed store composes record, document, and lock repositories behind ManagedStore instead of chaining unrelated repository classes through inheritance.
Database migration and transaction handling stay in one module.
Wallet proof logic, HTTP error mapping, and request authentication have separate modules, and route handlers remain small.
The committed store modules are between 19 and 194 lines and the wallet proof module is 176 lines.
No file split refactor is required for these reviewed commits.

## Verification evidence

Run from `apps/frontend`:

```sh
npx tsx --test test/managed-schema.test.ts
npx eslint lib/managed test/managed-schema.test.ts test/managed-fixtures.ts --max-warnings=0
npx tsx --test test/managed-store.test.ts test/managed-auth.test.ts
npx eslint lib/server/store lib/server/auth app/api/auth test/managed-store.test.ts test/managed-auth.test.ts --max-warnings=0
```

The original contract suite passed all four tests and its focused lint check.
The committed store and auth suite passed all nine tests and its focused lint check.
SQLite emitted the runtime's experimental feature warning; there were no test failures.
Independent probes reproduced R1 through R4 without modifying implementation files.
The existing tests did not cover those malformed metadata or login exhaustion cases.
No browser wallet, RPC transaction, power-loss fault injection, or multi-process contention claim follows from these results.

## Correction verification

The reviewer independently read the complete relevant diff of `1b6315449f79376609c7b76c4f0c3d72148b2c06` and verified that the tested contract, store, authentication, route, and test files matched that revision.
R1 now uses a separate unsigned RPC quantity schema capped at 64 hex digits.
R2 now uses a focused registration schema with equal-length, uniqueness, and maximum-length checks.
R3 now checks shared token decimals and symbols across both pair definitions and policy spending budgets.
R4 removes the unauthenticated per-owner quota and adds a regression that signs in successfully after 20 unsolicited challenges for the same owner.
The removal fixes targeted wallet lockout; it does not establish resistance to general request or database exhaustion on a public server.

Final commands run independently from `apps/frontend`:

```sh
npx tsx --test test/managed-schema.test.ts test/managed-store.test.ts test/managed-auth.test.ts test/managed-auth-http.test.ts
npx eslint lib/managed lib/server/store lib/server/auth app/api/auth test/managed-schema.test.ts test/managed-fixtures.ts test/managed-store.test.ts test/managed-auth.test.ts test/managed-auth-http.test.ts --max-warnings=0
npm run typecheck
```

All 17 tests passed, scoped lint passed, and full frontend TypeScript checking passed.
Additional independent assertions checked the actual lifecycle call schema with `0x0`, the uint256 maximum, uint256 overflow, negative quantities, and the opposite registration mismatch of three tokens with two amounts.
Every assertion passed.
The HTTP test uses real local HTTP requests to the actual authentication route handlers and a generated fixture wallet signature.
Its authenticated read check invokes `requireOwner` directly, so it does not prove a full managed-group HTTP endpoint or browser wallet flow.
The focused module split remains acceptable after the corrections.
No implementation refactor remains required within this review's private local scope.
