# Token registry code-quality review

Reviewed September 12, 2026 in Asia/Bangkok.
Final verdict: accept the registry-owned corrections in `65165830f28e4b98e801864187d49a09c5c184a5` for R1 through R4.
R5 remains a managed workflow integration gate and is not covered by that scoped acceptance.
The original request-changes findings remain below as the review history.
This review changed only this report and submitted no transactions.

## Scope and ownership

The original implementation owner is Orca dispatch `ctx_b7f36089d4c8`.
The independent reviewer is dispatch `ctx_3a30281f87bc`, task `task_12661d7ad91c`.
The assigned commits are `3e069eb647b159760b7258922b6af177851ac900`, `a9bb4740d557330ffaba37b33cf8c8e67bd9b590`, `dda88d29887dc912a6c5215b1ab71d6ccb0098c8`, and `d603c08f24dc503e51653bf3b0a2d9c4642af847`.
The coordinator also requested review of follow-ups `86a1d40`, `c4ae506`, `faa301f`, and `da241ac`.
The findings below apply to that combined scope unless a follow-up resolution is stated.

I read the implementation plan, the frontend AGENTS.md, registry modules, API routes, generator, generated catalog, registry tests, and implementation evidence report.
I inspected the current managed selector and proposal backend only to assess integration compatibility.
Those shared files contain other workers' changes and are outside this review's edit ownership.
I preserved all existing dirty work and did not run the generator or modify generated files.

## Required fixes

### R1: Public validation exposes unbounded credentialed work, P1

`apps/frontend/app/api/tokens/validate/route.ts:14-22` accepts arbitrary-length address and amount strings and parses an unrestricted JSON body before calling the provider-backed validator.
The route has no authentication, admission limit, or concurrency limit.
Each valid request can invoke a paid 1inch quote and up to eight RPC operations for two ERC-20 assets, plus registry refresh work.
The registry cache does not limit quote or metadata calls.

An actual POST to the existing Next server at `127.0.0.1:33127`, with no cookie or authorization header, returned HTTP 200 and an available Robinhood ETH-to-USDG quote at `2026-09-11T20:21:53.678Z`.
This demonstrates anonymous access to credentialed work without a load test.
No credentials appeared in the response.

Apply bounded request parsing before JSON allocation where supported, fixed address validation, amount bounds, and an explicit admission policy for upstream work.
Use authenticated ownership or a deliberate public quota policy, plus bounded concurrency and per-client limits appropriate to deployment.
Test that oversized bodies and exhausted admission limits produce no upstream calls.

### R2: Amount validation accepts impossible input and rounded output, P2

`apps/frontend/lib/server/token-validation.ts:167-183` converts unknown `dstAmount` values with `String()` before accepting them.
JavaScript numbers can already have lost integer precision before this conversion.
The input check at lines 199-203 has no uint256 maximum or decimal-string length bound.

A probe against an extracted `d603c08` tree supplied input `2^256` and a numeric provider output written as `9007199254740993`.
The validator returned `route.status: available` with output `9007199254740992` and preserved the impossible input amount.
The output had already rounded during numeric JSON construction, which is exactly why numeric provider values must be rejected.

Require a positive, bounded uint256 decimal string for both raw input and raw output before BigInt conversion.
Reject numeric JSON outputs even when their printed form contains only digits.
Add boundary coverage for zero, uint256 maximum, maximum plus one, numeric outputs, malformed JSON shapes, and oversized strings.
Keep provider transport failures separate from malformed successful responses.

### R3: Provider outages have no complete retry backoff, P2

The assigned `d603c08` source cache retries a failed refresh on every sequential request after expiry.
Follow-up `c4ae506` adds a 30-second retry delay when a previously successful cached response is still within the stale window.
Its new test passes, but a cold cache or a cache beyond its stale window still returns the fallback without recording a retry deadline.

Three sequential cold-cache calls with a failing injected provider produced three provider attempts.
The cold-failure branch is unchanged in `c4ae506`.
Concurrent request deduplication does not solve sequential retries.

Record a bounded retry deadline for failed refreshes even when the returned snapshot is the committed fallback.
Preserve the original capture timestamp and degraded state instead of treating fallback access as fresh provider data.
Test cold outages, warm outages, stale-window expiry, recovery, and simultaneous requests.
The existing two maps are bounded by the four permitted chain IDs, so unbounded cache key growth is not the issue.

### R4: Conflicting duplicate identities can discard risk information, P2

`apps/frontend/lib/token-registry.ts:142-145` keeps the first address record and discards later records before examining their metadata or risk tags.
A fixture with a six-decimal untagged first record and an eighteen-decimal `RISK:malicious` second record for the same address returned the first record as selectable with risk `unknown`.
Only the aggregate rejected count disclosed a problem.

Quarantine conflicting chain-and-address records, or apply a documented conflict policy that cannot weaken risk or silently choose conflicting decimals.
Identical duplicate records can be deduplicated without changing identity.
Test both input orders so selectability does not depend on provider record ordering.
Distinct addresses sharing a symbol already remain distinct and are correctly ordered by the existing tests.

### R5: Full-registry selections cannot complete the managed proposal contract, P1 integration gate

The current `components/managed/token-select.tsx` fetches the full registry and allows any selectable result.
The current `lib/server/managed-service/snapshot.ts:33-36` still resolves `verifiedToken` through the small generated catalog in `config.ts`.
That same helper supplies wallet snapshots and validates proposed configuration tokens.

The live token search returned Robinhood HOOD address `0x5f6cd1cb5c90d733f0e1b540044230225a96836d` as selectable.
Calling the real backend `verifiedToken(4663, address)` rejected it with `Token is not in the verified list for this network.`
No component or proposal consumer of `/api/tokens/validate` or `validateTokenPair` was present in the inspected integration snapshot.
The selector also defines a local response with numeric `fetchedAt`, while the exported API contract returns an ISO string.

Route this fix jointly to the managed API and UI owners.
Use authoritative chain-and-address metadata throughout proposal construction, revalidate decimals and risk server-side, and obtain fresh amount-specific quotes before accepting executable plans.
Reuse the exported response type in the selector.
Prove the real proposal flow with at least one listed asset absent from the fallback and prove rejection of decimals mismatch, blocked risk, and unavailable required routes.
This is an integration acceptance condition, not a request for the registry worker to edit another owner's files without coordination.

## Maintainability and remaining limits

The split between client-safe types and parsing, registry retrieval, token validation, and thin route handlers is appropriate.
The server barrel preserves a small import boundary, and no further file splitting is required merely to reduce line counts.
The existing config and RPC dependencies follow repository conventions.
Provider URLs are fixed server-side, and exception paths do not forward provider response bodies or authorization headers to clients.

Search bounds query length and result count, ranks exact addresses first, and preserves duplicate symbols.
It is a capped search API, not a paginated listing API.
Against the live server, `limit=2&offset=2` returned the same first two addresses as `limit=2`, with total 380.
The current selector requests only 30 results and offers no continuation.
Either explicitly document capped search and show that more matches require a narrower query, or implement stable pagination with tests for ties and refreshes.
Do not claim pagination support in the present implementation.

Decimals parsing accepts the ERC-20 uint8 range and metadata validation compares the contract value to the registry value.
Native metadata uses the supported chains' eighteen-decimal convention without a contract call.
Metadata and route status remain separate, which is useful, but consumers must not treat `route.available` as proof that metadata matched.
The route check classifies every HTTP 400 or 404 as `no_route`; distinguish documented no-route errors from other bad-request or provider failures when expanding error handling.

The generator selects exact chain-and-address identities and does not resolve ambiguous symbols.
Follow-up `86a1d40` corrects image filename extensions using returned media types.
All 35 current fallback image paths exist and their file-detected media types match their extensions.
Generator host allowlisting currently applies to the initial URL only, and fetches have no explicit timeout, size ceiling, or redirect destination validation.
These are offline generator hardening opportunities; they are separate from the public endpoint admission blocker.

## Source and freshness checks

Read-only requests to the [public 1inch lists](https://tokens.1inch.io/v1.2/1) on September 11 at approximately 20:21 UTC reproduced the report's counts.

| Chain ID | Entries | Duplicate symbols | Fallback entries checked |
| --- | ---: | ---: | ---: |
| 1 | 2453 | 4 | 11 |
| 56 | 1821 | 0 | 8 |
| 42161 | 1030 | 0 | 10 |
| 4663 | 380 | 19 | 6 |

All four responses had `public, max-age=360, s-maxage=360`, no Last-Modified header, and no wrong-chain records.
Every fallback address, symbol, name, and decimals value in the extracted `d603c08` catalog matched the corresponding current public record.
Fetch time establishes retrieval freshness, not a publisher's guarantee that metadata or risk assessment was updated at that time.

The report correctly distinguishes public availability from a redistribution license and avoids treating contributor names as permission to redistribute logos.
The [Uniswap repository](https://github.com/Uniswap/default-token-list) currently declares GPL-3.0, consistent with the report.
GitHub API repository checks returned HTTP 403, so I did not independently reconfirm the claimed 1inch archive date or Trust Wallet push timestamp.
Those remain attributed historical observations in the implementation report, not newly verified facts in this review.
No standalone license was established for the 1inch endpoint response or the added third-party logos.
The small allowlist limits downloaded assets but does not itself establish redistribution permission.

## Test evidence and disposition

An extracted `d603c08` frontend tree, using the installed dependency directory without changing repository source, passed all 10 registry tests.
Focused ESLint passed for the registry modules, API routes, tests, generator, and verification script with zero warnings.
The current shared tree with `c4ae506` passed all 11 registry tests, including its warm-stale retry test.
Additional isolated probes reproduced R2, R3, and R4 without network transactions.
Live HTTP checks demonstrated duplicate-symbol search, the missing pagination behavior, and one anonymous metadata-plus-quote request.
The HOOD integration check called the actual backend lookup directly; it was not a complete browser proposal test.

I did not repeat the full frontend suite or TypeScript check while unrelated workers were modifying the shared tree.
The successful broad checks recorded by `faa301f` and `da241ac` are implementation-worker evidence, not independent results from this review.
No browser wallet action, transaction simulation, signature, submission, or asset transfer occurred.

R1 through R4 require implementation fixes and focused regression tests.
R5 requires joint UI and managed API integration evidence before the expanded token workflow can be accepted.
Early findings were sent to the coordinator during review.
The requested direct message to the original implementation dispatch was rejected because that dispatch had already completed, so the coordinator needs a fresh fix dispatch.
None of the reviewed follow-ups resolves the remaining acceptance blockers.

## Corrected commit review

At approximately 20:33 UTC, I independently reviewed correction commit `65165830f28e4b98e801864187d49a09c5c184a5` from dispatch `ctx_87da1c298c8d`.
This section supersedes the earlier R1 through R4 disposition.
The accepted scope is `app/api/tokens/validate/route.ts`, `lib/token-registry.ts`, `lib/server/token-registry-source.ts`, `lib/server/token-validation*.ts`, `test/token-registry*.test.ts`, and the registry evidence report.

R1 is resolved for the documented single-process deployment boundary.
The handler authenticates before reading the body, limits streamed JSON to 1024 bytes, validates addresses and amounts, and admits upstream work through a focused limiter module.
The limiter bounds per-owner and process request rates and concurrent validation calls, and prunes expired inactive owner records.
This is process-local admission control, not a shared quota across multiple server replicas.
The deployment must retain that distinction.

R2 is resolved by a shared positive uint256 decimal-string predicate.
Numeric provider amounts and overflowing values are rejected, while the uint256 maximum remains representable without rounding.
Malformed quote JSON reports an unavailable result.
R3 is resolved by caching the fallback with a retry deadline after cold failures and stale-window exhaustion, while preserving its original capture timestamp.
R4 is resolved by quarantining conflicting metadata identities and merging the strongest risk for otherwise matching duplicate identities.

An isolated extraction of `6516583` passed all 22 registry tests.
The same run passed three managed token-resolution and freshness tests, for 25 total passes.
Focused ESLint passed with zero warnings for the registry modules, routes, tests, generator, and verifier.
The added tests cover zero-upstream-call rejection for authentication, body bounds, rate limits, and concurrency limits, as well as cold and warm outage recovery, simultaneous refresh deduplication, uint256 boundaries, numeric quote rejection, and both orders of conflicting duplicate records.

The implementation worker reported live HTTP 403 without Origin and 401 with the matching Origin but no session after the correction.
My independent repeat against the shared Next server returned HTTP 500 with a development compilation error in an actively edited `components/managed/token-select.tsx:30`.
A second repeat returned the same non-JSON development response.
Those HTTP results are an integration verification limit, not evidence that the corrected validation handler returned a quote anonymously.
The coordinator received the compilation failure and the registry test results.

The correction commit also contains managed-service, automation, and related test files that the correction worker reported were included through shared-index contamination.
I did not change or rewrite those files or the commit.
Their presence in the same SHA does not extend this registry approval to their behavior or ownership.
The coordinator was informed and must account for those changes through the managed implementation and review owners.

The managed additions demonstrate non-fallback token resolution in a unit test, but the new `managed-service/tokens.ts` verification map does not evict expired entries or enforce a size cap.
Its selection path also skips fallback catalog addresses before checking fresh registry risk and metadata.
I routed those concerns to the coordinator for the integration reviewer.
The complete browser proposal flow, fresh validation of selected fallback assets, cache bounds, and server-side execution checks still need R5 acceptance evidence.
The selector response typing and current compilation state are likewise UI-owned.

Final acceptance is limited to the registry-owned R1 through R4 corrections at the exact SHA above.
No further registry module split is required by this review.
The earlier capped-search and generator-hardening observations remain documented limits rather than newly resolved features.
