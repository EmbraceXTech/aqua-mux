# Route integration quality review

Reviewed September 12, 2026 for task `task_88c9ba33490d`, dispatch `ctx_f2f8da360364`.
This worker owns only this report and does not edit implementation files.
The implementation plan, frontend AGENTS instructions and repository integration audit were read.
Existing dirty work remains outside this report's commit scope.

## Review status

Lifecycle commit `8384c59a5b7eb04a672903777bf4d3e0226f0a09` is accepted for this review scope.
Its 13-path manifest was inspected, and the reviewed lifecycle source, schema and route tests match the commit without a working-tree diff.
Signing commit `42b25fca237ddcdccc6651b62037dcfa09db7c8c` is accepted for this review scope.
Its 14-path manifest was inspected, and the reviewed dev-wallet source and tests match the commit without a working-tree diff.
Both requested deliverables pass this independent code-quality review, with no remaining refactor request.
Repository-wide integration acceptance remains with the coordinator because other owners are still changing shared dependencies.
The lifecycle owner is dispatch `ctx_b105d1c86f80`, continuing `ctx_062e6c134321`.
The signing owner is dispatch `ctx_d6e714520793`, continuing `ctx_51e6cbc98730`.
The review includes managed-service route persistence already present at API checkpoint `645c892` and the optional `routesDigest` field in the lifecycle schema.
It does not repeat acceptance of the earlier lifecycle, dev-wallet or route-policy baselines.

## Findings and required evidence

The compiler now derives route authority from its own maker, chain, selected assets, spend amount, minimum and slippage settings.
It clones requests before dependency callbacks and clones callback results before retaining them.
This prevents a quote callback from modifying the independent request used to validate the returned route.
The mutation regression passes in the current working tree.
Nested callback isolation and retained-result mutation regressions also pass in the accepted lifecycle commit.

The signer calls route validation and provenance verification before transaction signing and again before broadcast.
Its final validation also rejects expiry reached during later balance or fee reads.
The original route-free signing fixture did not demonstrate the new route transition behavior.
The signing owner added a separate loopback-RPC fixture for route expiry and changes to router, pool, wrapped proxy, wrapped implementation, implementation slot, chain and token decimals.
It tests refusal before signing and between signing and broadcast, with zero journal writes and zero sends, followed by an accepted control transaction.
The independent rerun passes.

Aggregate receipt coverage exposed a case-sensitive duplicate-address check.
A duplicate USDC receipt with different address capitalization could replace a USDT receipt while satisfying the receipt count.
The owner now canonicalizes addresses before duplicate detection.
Independent tests pass for multiple routes to one destination, an incorrect aggregate total, duplicate receipts and the case-variant omission regression.
This correction preserves displayed receipt completeness; exact route calldata validation remains a separate enforcement check.

## Authority and accounting inspection

The lifecycle route validator compares the returned route against the independent request and recompiles the exact permitted calldata.
It does not authorize arbitrary provider executor bytes after a successful simulation.
Default dependencies reject opaque routes before simulation.
Test dependency overrides are server-only fixture hooks and are not request parameters.

The compiler's canonical `routesDigest` covers ordered request and route records.
The canonical managed plan digest includes that field while excluding authorization itself.
The managed API verifies the route-record digest before atomically storing the plan, context and owner-scoped route document.
The signing adapter checks the stored plan digest and the canonical route-record digest before constructing its batch.
Missing route records fail closed when actual router calls reach `validateDevRoutes`.
Optional digest compatibility for old route-free plans does not authorize router calls without records.

The dev-wallet route validator matches every actual router call to one route record in order.
It checks the maker, chain, expiry, token metadata, encoded receiver, source amount, destination and minimum.
It aggregates minima by destination and requires one matching receipt per destination with verified decimals.
Caller-supplied API data cannot replace these server-compiled route records.

Funding reserves remain separate from purchase spend, and registrations use conservative minimum receipts.
Selected native inventory converts directly to the wrapped-native target through a deposit call.
The compiler counts native call value, gas estimate and recovery reserve against the final snapshot.
The signing adapter retains the reserve and the signer checks current native balance against call value, maximum fee and reserve again before broadcast.
Close-only planning remains route independent.
Fork simulation and receipt assertions demonstrate execution properties on a local chain and do not establish live-wallet authority or live transaction success.

## Maintainability

The new dev-wallet modules separate basket compilation, route validation and stored managed-plan adaptation.
The signer retains transaction preparation and guarded submission.
Lifecycle conversion, funding, route adaptation, inventory and snapshot guards remain separate files, with orchestration in `lifecycle/index.ts`.
The inspected files follow the repository's TypeScript conventions and share canonical digest and route-policy validation helpers.
No component or file split refactor is required for this scope.

## Independent verification

The following commands ran from `apps/frontend` against the working tree under review.
The test totals overlap and must not be added as a unique coverage count.

```sh
npx tsx --test test/lifecycle-routes.test.ts test/lifecycle.test.ts lib/server/dev-wallet/compile.test.ts lib/server/dev-wallet/routes.test.ts lib/server/dev-wallet/managed-plan.test.ts
npx tsx --test lib/server/dev-wallet/*.test.ts test/route-policy.test.ts test/managed-execution.test.ts test/managed-freshness.test.ts
npx eslint lib/server/lifecycle lib/server/dev-wallet/compile.ts lib/server/dev-wallet/routes.ts lib/server/dev-wallet/managed-plan.ts lib/server/dev-wallet/signer.ts test/lifecycle-routes.test.ts --max-warnings=0
```

The first command passed 29 tests.
The second command passed 26 tests.
Scoped lint passed without warnings.
After the signing regressions landed, the second command passed 30 tests, including the new signing transition fixture, aggregate receipt cases and wrapped proxy provenance coverage.
`npx eslint lib/server/dev-wallet --max-warnings=0` also passed.
An independent normal fork verifier run passed all 15 checks on isolated port `19873` at Arbitrum block `504194055`, completed at `2026-09-11T22:30:55.994Z`.
Its output is preserved at `/var/folders/x3/4w6qlmgx7ss4zsvzcjq7592m0000gn/T/aquamux-route-review-4beb3hcu/verification/fork.json`.
The transparent conversion ended with `20990001936400169` raw WETH and zero USDT.
The successful funding transaction was `0x7c7615423d0d8108fd93b1dd1c480d026fcf5844332440fc6512ecf1ad4bfd58`.
The intentionally reverted conversion was `0xfa4201f3dfdb6c62b2d3ea942adabd526a77af796c7502d6704675081fdd4ffd`.
The successful conversion was `0xbcf8b8de2cf0e0ae3c28126699dc7c637bfe5415214951dcfe46a499eb03aa09`.
The shared generated verification file is not modified by this review.
The earlier owner report records 15 passing fork checks at Arbitrum block `504166841`.
The expanded lifecycle route test file independently passed all nine tests after nested callback regressions landed.
The first full `npx tsc --noEmit --incremental false` check failed during an active token-resolver migration in shared files.
Those errors were sent to the legacy-token owner and signing owner for correction before final acceptance.
The signing compiler and test fixture errors were corrected and independently rechecked.
A later full typecheck reduced the remaining errors to `components/aquamux.tsx:558`, where a token array is passed to the new token-resolver function parameter.
The coordinator has that exact error for routing to its owner.
Full repository typecheck success is not claimed by this review.
The signing tests include the route-policy owner's concurrent wrapped-proxy provenance extension, and the resolver adaptation depends on the legacy-token owner's concurrent resolver interface.
Their separate ownership and release gates remain in effect.
No live transaction is authorized or sent by this review.
