# Token integration code-quality review

Reviewed September 12, 2026 in Asia/Bangkok for task `task_c4867f10783a`, dispatch `ctx_5d324500646e`.
Disposition at the initial checkpoint is request changes.
Registry-owned R1 through R4 remain accepted at `65165830f28e4b98e801864187d49a09c5c184a5` as recorded in [the registry review](token-registry-quality-review.md).
That acceptance does not cover the following managed and legacy integration findings.

## Scope and ownership

The reviewer owns this report and the existing final appendix in `token-registry-quality-review.md`.
No implementation source, generated file, changelog, transaction, signature, or wallet submission belongs to this review.
The inspected shared tree contains concurrent edits, so initial findings describe observed working files rather than approval of a clean commit.
The review read the implementation plan, frontend AGENTS.md, previous registry review, and accepted repository commit protocol.

The original legacy owner was `ctx_58f8acbce503`; the resumed correction owner is `ctx_4e2bc4a54150`.
The managed boundary includes `645c892`; the current API correction owner is `ctx_73902e503cfe`.
The original UI integration scope was `ctx_e042e02d5955`; the resumed UI owner is `ctx_9499c9279631`.
Findings and requests for final correction SHAs were sent through Orca to those active owners and the coordinator.

## Required corrections

### T1: Legacy routes bypass authenticated admission, P1

`app/api/quote/route.ts` reads an unrestricted JSON body and calls `resolveLegacyBasket` without authentication or admission control.
`app/api/plan/route.ts` similarly reads unrestricted JSON and calls `buildPlan`, which now resolves dynamic metadata.
Both routes expose registry and RPC work, while quotes also consume credentialed provider capacity.
The bounded and authenticated `/api/tokens/validate` handler does not protect these independent entry points.

The existing legacy integration test invokes the real quote route with no cookie or authorization header and obtains HTTP 200 from fixture-backed upstream calls.
This independently reproduced the missing boundary without using a real credential or submitting a transaction.
Require authentication or an explicitly bounded public admission design before body parsing and upstream work, bound streamed JSON, and cover refusal with zero-upstream-call tests.
The legacy UI must use the resulting contract and must not silently break anonymous editing or authenticated quote acquisition.

### T2: Bundled metadata overrides authoritative verification, P1

`lib/config.ts` resolves `token` from the bundled catalog before consulting its `verifiedTokens` argument.
`resolveLegacyBasket` can verify current registry and contract decimals, then pass those tokens into `validateBasket`, `quoteBasket`, strategy construction, and `buildPlan`.
Those consumers still receive bundled values for an address present in both sources.

A local probe supplied ARB metadata with verified decimals 6 while the bundled record has decimals 18.
`token(42161, address, [verified])` returned decimals 18.
This demonstrates incorrect precedence independently of whether that particular contract ever changes decimals.
Use the authoritative request snapshot consistently for amount scaling, labels, strategy compilation, and returned plan metadata.
Add a regression where registry and contract agree with each other and differ from the bundled catalog.

### T3: Managed metadata remains shared mutable state across awaits, P1

`managed-service/token-cache.ts` now bounds entries to 256 with a five-minute TTL and prunes expired entries.
The focused eviction and expiry tests pass.
However, `ensureManagedTokens` writes a process-global cache and returns no request-owned token snapshot.
`walletSnapshot`, `intentSnapshot`, `proposeIntent`, `createGroup`, and `planFunding` call `verifiedToken` after asynchronous RPC, quote, or model work.
Another request can replace or evict entries before those consumers read them.
An evicted nonfallback address then reaches the static catalog error, while a replaced record can change the metadata used for validation.

The cache also retains input objects by reference.
A local probe cached a six-decimal token, mutated the original object's decimals to 18, and read back 18 from the cache.
Make each request retain an immutable verified snapshot and explicitly pass it through the complete async workflow.
Cache entries may accelerate retrieval but must not remain the source of authority after request validation.
Cover cache eviction, TTL expiry, interleaved owners, native funding, stored recovery, and metadata injected through a request body.

### T4: Multiasset validation conflicts with the per-owner limiter, P1

`components/managed/proposal-form.tsx` launches all selected destination checks with `Promise.all`.
`token-validation-limit.ts` permits one concurrent validation operation per owner by default.
When two destination requests overlap, the second must return HTTP 429 and the form cannot complete the intended multipair proposal.
The passing API overload test proves that concurrent work is refused; it does not establish that the form schedules compatible requests.
Sequence checks or add a bounded server batch contract, and retain input-revision cancellation while checks run.
Prove two or more selected destinations through the actual form and API boundary.

### T5: Quote consumers repeat the rounded integer issue, P2

`lib/server/swap.ts` accepts provider `dstAmount` after `String` conversion and only checks positive digit syntax.
`managed-service/snapshot.ts` and `managed-service/funding.ts` apply the same conversion pattern.
Numeric JSON can lose precision before conversion, and these consumers do not reject a uint256 overflow.
The corrected `token-validation.ts` already exports and uses the stronger decimal-string boundary.
Use that boundary in these quote consumers and test numeric values, maximum plus one, zero, malformed JSON, and a valid maximum value.
Route validation success in a separate endpoint does not validate a later independently fetched quote.

## Verified behavior and code organization

The legacy resolver takes addresses from the parsed basket and derives symbol, name, decimals, and source from server registry records.
It rejects unknown addresses through `findRegistryToken`, blocks unselectable records, checks code through the metadata validator, and rejects mismatched decimals.
Native input uses the configured native sentinel.
The resolver returns a token list alongside the basket, which is an appropriate boundary once consumers use it authoritatively.
It does not accept client-provided token metadata as authority.

Managed group HTTP handlers authenticate before reading their bounded body and resolve new selections server-side before group validation.
The fresh-selection path checks registry risk even for bundled addresses.
Persisted group metadata is passed from owned server records for recovery, rather than directly from a request body.
Recovery still needs to preserve that ownership rule during the snapshot refactor.

The selector reuses `TokenSearchResponse`, renders full addresses, disables risk-blocked entries, and distinguishes registry metadata from route availability.
`useTokenSearch` debounces requests, aborts obsolete fetches, and prevents a previous chain/query result from replacing the current result.
The extracted search hook and small token selector are focused modules.
No arbitrary additional file split is required for the registry resolver or limiter.
The substantial legacy component already has unrelated changes; token search and selection logic should remain separately testable and should not accumulate server validation logic.

Both selectors consume capped search results without a visible matching-total or narrower-query notice at this checkpoint.
The search endpoint supports exact-address queries and returns a total count, but it has no pagination contract.
Neither the API nor documentation should imply that one response enumerates the complete registry.
The managed catalog correctly keeps delegated Privy and directional MM unavailable and requires owner confirmation for manual LP.
Its capability flags do not promise that every listed token has an available amount-specific route.

## Independent verification

At the initial review checkpoint, the following command passed all 31 tests in the shared frontend tree.

```text
node_modules/.bin/tsx --test test/token-registry*.test.ts test/managed-token-resolution.test.ts test/legacy-token-integration.test.ts
```

The run covered registry parsing and outage limits, authenticated token-validation admission, managed dynamic resolution and cache bounds, a fixture-backed dynamic-token quote, a provider route refusal, and a legacy liquidity plan carrying dynamic metadata.
The legacy fixture token was Arbitrum USDC.e at `0xff970a61a04b1ca14834a43f5de4533ebddb5cc8`.
These are API and module tests using injected network responses, not proof of a live route or an end-to-end managed proposal.

Focused ESLint passed for the legacy resolver, quote and plan handlers, managed token resolver and cache, search hook, selector, and legacy integration test with zero warnings.
The metadata-precedence and mutable-cache probes independently reproduced T2 and T3.
An independent headless Chromium session against `http://127.0.0.1:33127` selected `0xff970a61a04b1ca14834a43f5de4533ebddb5cc8` in the legacy output picker and managed funding picker without browser errors.
The live registry calls this address `USDC_1`, with name `USD Coin (Arb1)` and risk `info`; the test fixture calls the same address `USDC.e`.
Both selectors preserved the full address and displayed `route not checked`.
An initial browser attempt clicked before hydration completed and timed out waiting for the picker; repeating after network idle completed the selection checks.
A direct metadata check from the review shell returned `unavailable`, so it establishes no live onchain metadata or route acceptance.
Final correction and full proposal evidence remain pending at this checkpoint.
No transaction simulation, signature, submission, or transfer occurred.

Final integration acceptance requires the correction owners' final SHAs, independent regression review, and full-registry token selection through both quote and plan workflows.
