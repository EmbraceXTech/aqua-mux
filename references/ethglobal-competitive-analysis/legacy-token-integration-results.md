# Legacy token integration results

Prepared September 12, 2026 for task `task_847265a55874` and dispatch `ctx_4e2bc4a54150`.

## Outcome

The existing Multi-swap and Multi-LP server paths now accept tokens from the full runtime registry after server-side admission.
Each selected ERC-20 must exist in the current registry snapshot, remain selectable under its risk tags, have deployed contract code, and return the same decimals on-chain as the registry record.
The server uses the verified on-chain symbol and name when those reads differ from registry display metadata.
The small committed catalog remains the synchronous fallback for existing consumers, but browser-provided metadata cannot expand server acceptance.
The existing two-to-six-leg basket constraint and shared fee remain unchanged.
The existing pair-specific range work remains in the shared working tree and was not removed or overwritten.

## Reproduction

Before the server resolution path, an API-handler reproduction used the historical quote route logic with Arbitrum USDC.e at `0xff970a61a04b1ca14834a43f5de4533ebddb5cc8`.
That address is present in the public registry and absent from the small committed fallback catalog.
The handler returned HTTP 400 with `Token is not in the verified list for this network.` before it attempted a quote.

The focused route fixture now sends that same basket through the quote API handler.
It resolves USDC.e with six decimals, obtains a positive provider quote, and returns it as a selected leg.
The corresponding Multi-LP fixture builds two strategies and carries the verified USDC.e metadata into the returned plan.

## Server boundary

`resolveLegacyBasket` parses the basket before any registry lookup.
It obtains one registry snapshot for the selected chain and resolves the unique selected addresses.
Native assets use the known chain configuration.
Native-funded LP plans also verify the wrapped-native token because the planner introduces that asset during compilation.
The resolver rejects stale snapshots for tokens outside the committed fallback, blocked risk states, missing code or decimals, and registry-to-chain decimals mismatches.
It freezes every admitted token object and the returned token list.
Downstream validation, quote arithmetic, plan labels, and LP compilation share one resolver over that immutable set.

The global `token` helper still reads only the committed catalog.
`validateBasket` remains synchronous and accepts an explicit resolver instead of an arbitrary token array.
This keeps client-side metadata from becoming server authority.

Both `POST /api/quote` and `POST /api/plan` authenticate the wallet session before reading the request body.
They accept only JSON bodies capped at 8,192 bytes and share process-local concurrency and request-rate admission.
Admission failures occur before registry, RPC, or route-provider work.
The plan route requires its `account` field to equal the authenticated session owner and passes that owner into the planner.
Successful responses are marked `private, no-store`.
Hosted deployment still needs shared ingress admission because the in-process limiter covers only one Node.js process.

## Client contract

The Multi-swap and Multi-LP client must send `Authorization: Bearer <managed session token>` and `Content-Type: application/json` to both legacy routes.
The quote body is the basket object.
The plan body is the strict object `{ basket, account }`, where `account` equals the authenticated session owner.
Client-side dynamic-token shape checks should call `basketSchema.parse`.
Only the authenticated server performs registry and on-chain token admission.

## Test evidence

`node --import tsx --test test/legacy-token-integration.test.ts` passed seven tests.
The tests cover the real non-fallback USDC.e fixture, matching on-chain decimals, blocked risk, decimals mismatch, provider quote failure, verified metadata precedence, frozen propagation, authentication before resolution, body bounds, admission before resolution, plan owner binding, and dynamic-token LP plan output.

The focused ESLint command over the nine implementation files completed with zero warnings.
`npm run typecheck` completed successfully after the route factories moved into `lib/server/legacy-handlers.ts`, which keeps the Next.js route modules limited to supported exports.
`git diff --check` passed.

An earlier complete test run passed 156 tests and skipped one environment-dependent test before concurrent managed-token work added new cases.
The latest complete run passed 158 tests, failed one separately owned in-progress managed-token metadata test, and skipped one environment-dependent test.
The failing test is `display label drift uses the contract symbol only after matching decimals` in `test/managed-token-resolution.test.ts`.
The latest full lint run also found seven CommonJS import violations in the separately owned untracked `lib/server/route-policy/fixtures/provenance/recompile.cjs` fixture.
These concurrent failures were routed to the coordinator and left untouched by this worker.

## Read-only live checks

`npx tsx scripts/verify-token-registry.ts` completed on September 11, 2026 UTC without submitting transactions.
It verified contract metadata and received a positive point-in-time route for ETH to AAVE on Ethereum, BNB to XVS on BNB Chain, ETH to GMX on Arbitrum, and ETH to USDG on Robinhood Chain.
A successful quote proves point-in-time route availability only.
It does not authorize execution or prove that a later quote will remain available.

## Ownership and review

This worker owns the focused legacy quote and plan routes, route handler module, token resolver boundary, legacy HTTP admission helper, planner and swap resolver propagation, model resolver contract, legacy integration tests, and this report.
The UI worker owns the client session wiring and picker integration.
The registry worker owns registry ingestion, search, metadata checks, generated catalog files, and generated token images.
No generated file, changelog, secret, real transaction path, or unrelated dirty UI file was modified for this deliverable.

A separate code-quality agent must review the owned files for module focus, file split, repository conventions, and long-term maintainability before integration acceptance.
Any required refactor from that review must land before this work is accepted.
