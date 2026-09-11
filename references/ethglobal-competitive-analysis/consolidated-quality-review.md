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
| Route provenance, `a9a7c273` with `cad298a7d98837b410f77adc63a3f822fb4d0523` | Accepted for the Arbitrum and BNB route-policy scope. | Nine route tests, thirteen adapter tests, seven compiler replays, 260 independent mutations and expiry/proxy probes pass; corrected recursive route lint passes. | External execution and funded lifecycle evidence remain separate. |
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

## Route replay correction accepted

The route scope is accepted through correction `cad298a7d98837b410f77adc63a3f822fb4d0523`.
The correction replaces the CommonJS replay script with `recompile.mjs` and independently derives each immutable variable name from the compiler AST.
The script compares the resulting named offset map to the attestation, in addition to checking compiler hashes, input hashes and runtime templates.
All seven replays pass with these stronger checks, and recursive route-directory ESLint passes with zero warnings.
The old Solidity 0.4.18 compiler emits a V8 asm.js warning but completes its checked replay successfully.
The correction changes no route runtime files, so the preceding runtime tests and independent security probes remain applicable.
No additional module split is required.
Use `node lib/server/route-policy/fixtures/provenance/recompile.mjs /tmp/aquamux-route-policy` for the corrected replay command.

## Token-label and exact-amount milestone checkpoint

The app owner delivered `de0c0e0a819c2834a3f96577676eb51ad677a25c` with nine owned files.
A separate isolated archive supplies this review snapshot.
The shared metadata helper accepts a verified or display-mismatched result only when the registry and on-chain decimals match the selected decimals exactly.
The actual metadata reader checks code at the selected address before reading contract metadata.
Client request binding retains chain, source, destination and raw funding amount checks, and refuses unselectable tokens.
The managed token snapshot uses the contract symbol after those checks.
The helper is small and shared by client and server code, so no additional split is required.

The quote consumers now require a canonical positive decimal string within uint256 before performing BigInt arithmetic.
Numbers, zero, leading zeros, fractions, negative values, absent values and overflow are rejected.
The maximum uint256 string remains exact through snapshot and legacy quote output.
These checks reuse the existing bounded parser rather than creating a second amount-validation policy.

Independent regression testing passes 34 of 39 tests.
Five existing legacy integration cases fail at the already recorded range 100 versus committed numeric-schema boundary.
Scoped lint passes for all nine changed paths.
The full isolated frontend typecheck finds two new errors in `test/quote-amount-boundary.test.ts`, whose range value is the string `full` while the committed Basket type accepts numeric values.
Acceptance is withheld until the owner corrects that owned fixture without importing the original dirty schema overlay.

The owner reports an Orca browser reproduction of the USDC_1 label failure and three passing proposal browser regressions before the latest browser-testing rule.
Those browser results were not independently rerun by this reviewer and do not represent a successful model response or wallet execution.
The same owner reports that the actual proposal now reaches the runner, where a strict request schema rejects the added tokenMetadata field.
The earlier metadata acceptance covers request-local concurrency behavior only; the proposal-to-runner integration remains blocked until its contract correction passes review.

The coordinator relayed updated user rules during this checkpoint.
Do not add or expand unit-test files, and use Orca's embedded browser commands for browser validation.
Existing unit tests may remain regression evidence, while new behavioral evidence must use the allowed end-to-end interfaces.
This reviewer has edited no implementation or unit-test files and has run no Playwright browser suite during this task.

## Shared authentication UI accepted

Commit `7e8c60b84aa377aea0a21d38e85aafa43be44194` is accepted for its shared session, authenticated legacy requests and managed navigation scope.
The reviewer used an isolated archive on port 33347 with a separate SQLite database and an authentication-only controlled provider on port 33348.
The actual challenge and signature-verification endpoints returned success.
The provider held a newly generated test key, exposed no private key and refused transaction methods.
Quote and plan responses were explicitly labelled transport fixtures that recorded only whether an Authorization header was present.

Orca page `b9bb90f7-f69e-40c6-9cba-c2b71a06f5e1` demonstrated authenticated quote and liquidity-plan requests, successful Strategies rendering without the previous wallet.session crash, and no additional quote request while the managed workspace remained open.
A controlled 401 response then cleared session storage and restored the Connect wallet interface.
The two invoked provider methods were eth_requestAccounts and personal_sign.
No transaction was signed or sent.
The reviewer inspected the retained liquidity screenshot and observed no horizontal overflow in the desktop journey.
Screenshots, snapshot and sanitized transport evidence are retained at `/tmp/aquamux-review-7e8c60b-evidence/`, with the liquidity image at `/tmp/aquamux-review-7e8c60b-liquidity.png`.
The isolated servers were stopped after capture.

Scoped ESLint passes for the changed components, session hook, quote hook and catalog resolver.
The small resolver separates token lookup from rendering, and the quote hook owns debounce, abort and result identity.
The component now receives the shared wallet object explicitly.
No additional module split is required for these changes.
The account and chain event guards were inspected in source; this browser journey did not independently test provider events because the controlled provider was installed after page mount.

Turbopack rejected the linked dependency directory in the isolated archive, so the reviewer used the existing Next webpack development option without changing source.
The first authentication attempt correctly rejected an unconfigured origin; restarting the isolated server with AQUAMUX_AUTH_ORIGIN set to its actual port resolved that test setup error.
An Orca browser command briefly reported a closed runtime connection, then subsequent snapshots and actions succeeded with the same page identity.
These setup events are not product failures or evidence of wallet incompatibility.
The accepted UI scope does not close the separately recorded committed range-fixture errors, runner contract mismatch or external execution gates.

## External adapter review started

The chain owner delivered `d95f89361e9b229cca193777345562896e1fafb6` with 23 owned files.
The code separates account provenance, preflight, signature verification, relay, transaction proof and provider interaction.
The proposed adapter now requires eth_signTransaction without broadcasting, with backend relay after renewed checks.
No wallet brand compatibility is claimed by the owner.
The new exact root trace and transaction prestate checks must replace the old envelope-only shortcut in application reconciliation.
The current fork scenario verifies the proof helper, then marks the attempt confirmed and releases its lock directly.
It therefore does not independently establish production reconciliation or HTTP recovery behavior.
Those remain explicit app integration gates.
An uncommitted management-rules import is a required dependency of the delivered chain milestone; execution verification awaits its exact commit rather than importing a changing shared file.
