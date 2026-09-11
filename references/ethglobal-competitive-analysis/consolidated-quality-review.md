# Consolidated implementation quality review

Reviewed September 12, 2026 for task `task_173b291f6c7f`, dispatch `ctx_e458160d2730`.
This independent reviewer owns this report and necessary appendices to existing quality reports.
No implementation files, existing dirty work, generated files, or changelogs were edited.
No public transaction was submitted.

## Review boundaries

The reviewer read the implementation plan, supplied agent instructions, frontend AGENTS instructions, prior route and API reviews, and the accepted repository commit protocol at `9fbb3b7`.
Acceptance is specific to each listed commit and scope.
An isolated archive of `a9a7c273511c4d589dcd10df3365edee6466ebc2` supplies the first review snapshot.
Installed dependencies were linked without installation or modification.
The original dirty overlay was not included, so the snapshot does not represent the complete starting workspace.
Owner-reported evidence and independently rerun evidence are distinguished below.

## Milestone decisions

| Milestone | Decision | Independent evidence | Remaining gate |
| --- | --- | --- | --- |
| Request-local metadata, `29a199d3bd5e07a1cdc95c08947417ac08bf0f7b` | Accepted for asynchronous metadata binding. | All 36 focused API, lease, auth, store and metadata tests pass; scoped ESLint passes. | Label normalization, inventory attribution and full app workflow remain separate. |
| Route provenance, `a9a7c273511c4d589dcd10df3365edee6466ebc2` | Security corrections verified; script lint correction required. | Nine route tests, thirteen adapter tests, seven compiler replays, 260 independent mutations and expiry/proxy probes pass. | Seven replay-script lint errors; final corrected commit verification. |
| External Phase 1 execution | Pending owner delivery. | Blanket refusal remains a safe interim boundary. | A compatible account path, simulation before journal/locks, exact transaction binding and receipt recovery. |
| Full initial app scope | Pending owner delivery. | Earlier narrowly scoped acceptances remain limited to their exact revisions. | Coherent app milestone and integrated browser/fork evidence. |

## Route source, authority and evidence

The route implementation keeps deployment declarations, calldata compilation, quote acquisition, request validation and RPC provenance in focused modules.
The retained compiler inputs and replay helper belong with deployment evidence and do not expand the transaction compiler.
No additional runtime module split is required for this milestone.

The post-RPC expiry check rejects a route that expires while provenance reads are in flight.
Arbitrum WETH provenance reads its EIP-1967 implementation slot and checks both the implementation address and implementation runtime hash.
The independent probes reject a substituted slot, an unavailable storage reader and changed implementation code while retaining the proxy shell.
A synthetic RPC error marker does not escape through the returned error text.
These are pre-submission checks and cannot prohibit an administrator upgrade after submission.

The compiler and validator bind complete calldata to the independently supplied request.
Receiver, input token, exact input amount or native value, minimum receipt, spender, pool and allowed direction flags remain explicit.
Integer parsing uses BigInt and rejects amounts at or above the documented 2-to-the-112 bound.
This is a deliberately restricted numeric domain within the ABI's uint256 representation.
The independent mutation script rejected all 256 single-bit changes to the native pool word and four request substitutions.
No arbitrary executor or trailing call bytes are accepted.
Adapters must still supply their independent reviewed request and bind route records to actual batch calls.

All seven retained compiler templates reproduced with the attested compiler hashes and source input hashes.
The offline test derives semantic immutable values and compares the reconstructed executable bytes and full deployment hashes for eleven retained deployment records.
The reviewer requested that the replay helper also compare compiler immutable references with the retained named offset map, so future replay verifies both template bytes and substitution locations.
The current source attestation does not authorize Robinhood.
Historical RPC call fixtures use synthetic balances and are not funded lifecycle transactions or current price observations.

The initial focused command passed 22 tests and failed two additional legacy basket compiler tests.
Both failures occur at BasketPlanSchema parsing because the committed schema refuses range 100, before the intended route checks run.
The original working tree has a separate dirty range-schema overlay.
The app owner must resolve owned fixture or compatibility changes without absorbing unrelated original user work.
This failure does not invalidate the nine passing route-policy tests, but full integration acceptance requires a coherent tested snapshot.

The frontend TypeScript check emitted no diagnostics.
Scoped ESLint over the full route-policy directory fails seven `no-require-imports` errors in `fixtures/provenance/recompile.cjs`.
The owner received this concrete correction request before milestone acceptance.

## Request-local metadata

The fourteen files changed by `29a199d` are unchanged in the reviewed service scope through `a9a7c273`.
Frozen metadata copies now travel with the wallet snapshot and remain available after RPC and model awaits.
Proposal policy, validation, group creation and funding use that captured metadata rather than depending on the mutable process cache after an asynchronous wait.
Tests exercise concurrent replacement, cache eviction, native funding, absent tokens and chain mismatch.
The separation between token verification, snapshot collection, proposal orchestration and funding remains appropriate.
No additional split is required for this correction.
This acceptance does not establish that stored symbols are normalized correctly or that all token-code and decimal checks required by later app changes are complete.

## Initial plan gates still open

The following gates come from the current task's full-plan audit and remain pending exact implementation delivery and review.
They are not new findings against the narrow accepted metadata correction.

- Normalize display labels such as USDC_1 only after verified address, runtime and decimal identity.
- Preserve exact integer quantities across wallet snapshots, funding quotes and legacy quotes.
- Attribute exit inventory from observed activity or require explicit selected quantities; support conversion after close and retry after route outages.
- Enforce native concentrated replacement, upward-only direction and cooldown deterministically within the authorized policy.
- Reconcile fresh fills before Resume and expose supported program expiry in the editor.
- Connect the actual AI runner through narrow read tools and record its real runtime evidence.
- Show initial strategy exposure and measured performance without fabricated metrics.
- Complete lease takeover and recovery browser tests for the initial recurring-review scope.
- Prove a compatible external execution path with exact batch, sender, destination, native value, implementation and receipt binding.

The existing SQLite one-group-per-wallet uniqueness constraint is valid and is not an open finding.
Unsupported delegated, MM, paid-service and Robinhood claims must remain absent until their distinct proof gates pass.
A controlled wallet provider or fork must be labelled as such; no actual MetaMask extension evidence is available in this review.

## Reproduction commands

Run from the pinned snapshot's `apps/frontend` directory.
The compiler cache must contain the binaries identified by the retained attestation.

```sh
npx tsx --test test/route-policy.test.ts test/route-policy-provenance.test.ts test/lifecycle-routes.test.ts lib/server/dev-wallet/routes.test.ts lib/server/dev-wallet/compile.test.ts
node lib/server/route-policy/fixtures/provenance/recompile.cjs /tmp/aquamux-route-policy
npx tsc --noEmit --incremental false
npx eslint lib/server/route-policy test/route-policy.test.ts test/route-policy-provenance.test.ts
npx tsx --test test/automation-lease.test.ts test/automation-review.test.ts test/managed-runner-http.test.ts test/managed-api-http.test.ts test/managed-execution.test.ts test/managed-auth-http.test.ts test/managed-auth.test.ts test/managed-store.test.ts test/managed-freshness.test.ts test/managed-token-resolution.test.ts test/managed-token-snapshot.test.ts
```

The independent supplemental mutation script is an isolated-path copy of `/tmp/aquamux-route-review-final.mts`.
Temporary scripts supplement the durable owner tests and do not replace committed regression coverage.
Full lint, unit, build, fork and browser acceptance waits for the app owner's stable final milestone.
