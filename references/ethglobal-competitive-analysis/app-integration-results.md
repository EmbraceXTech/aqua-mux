# App integration results

This report records the consolidated app owner's implementation and verification checkpoints.
Public-network transactions are excluded from this implementation run.
The funded development wallet and funding journals remain unchanged.

## Reviewed milestones

| Commit | Ownership | Verification | Review status |
| --- | --- | --- | --- |
| `7e8c60b` | Shared authenticated session, legacy quote fencing and registry selection | Historical 14 browser cases, full typecheck and lint; independent Orca browser review | Accepted |
| `de0c0e0` and `3e0defe` | Contract-authoritative token labels and exact positive uint256 quote boundaries | Independent 25 existing regressions and clean committed-schema typecheck | Accepted |
| `e032fd1` | Deterministic replacement rules, explicit conversion quantities and unconditional transaction proof | Existing execution, lease and position regressions; source review | Source split accepted; production HTTP evidence in progress |
| `01c7511` | Typed runtime tools, native funding preview and known-maker exposure | Real runner records below; 16 existing runner service tests; 18 focused frontend tests | Source split and service checks accepted; evidence review pending |

## Real application and model evidence

The Orca embedded page is `c95d3318-bbd2-4be3-90d6-fad9f99dd580` at `http://127.0.0.1:33127/`.
The authenticated HarnessAgent service runs on port 33128 with Codex and `gpt-6-astra`.
[Runtime evidence](app-live-runtime-evidence.json) includes selected request identity, immutable wallet snapshot, quote observations, model result and durable tool events.
It excludes authentication tokens, provider credentials and signing material.

Request `84237790-366b-4d3b-bccf-91ad67538e31` completed in 29,670 milliseconds and created an editable managed-concentrated WETH/USDC group from 0.0001 ETH with a separate 0.0005 ETH gas reserve.
Its source registry label was USDC_1 and its verified contract symbol was USDC with matching six decimals.
Request `244405e1-ffc8-4a56-9029-4b90a8cbe0db` completed in 27,407 milliseconds after editing the fee and saving the configuration.
The new review preserved the saved configuration and returned fund-and-open.
Both requests recorded the actual `proposal_preview` tool invocation inside HarnessAgent.
The tool returns verified wallet and known position observations with the compiler preview.
Earlier attempts exceeding quote freshness were rejected by the app and did not create an executable review.
The freshness policy was not widened to make those attempts pass.

The editor displays non-terminating prices as exact numerator/denominator input.
Changing the program expiry uses a UTC date-time field and invalidates previous plans.
The displayed proposal is a candidate for owner review, with fresh route verification and whole-batch simulation required before signing.
Five-basis-point fees and twenty-percent initial bounds are explicit editable defaults, not inferred optima.

## Current integration verification

The real HTTP fork script uses an isolated local chain, a public fixture key and a controlled sign-only provider.
It invokes the production authenticated handler, planner, relay and reconciliation code.
The opening review is explicitly a deterministic fixture so this check isolates execution and recovery from model variability.
The separate runtime evidence above covers actual AI behavior.

Production HTTP entry, sign-only relay, confirmed receipt reconciliation, active-configuration persistence, cooldown refusal and missing-inventory refusal have passed during the current script run.
Close-only also confirmed through production reconciliation.
The run exposed a compiler guard that still required a retirement for conversion after closing; the chain owner corrected that guard.
[Authenticated HTTP fork evidence](app-http-fork-results.json) now records the passing entry, close-only and subsequent closed-group conversion with production confirmation.
The public application plan error was isolated to a stale Next development-server record-store schema rejecting `deploymentEvidence`; a direct fresh-process call produced the five-call plan and simulation successfully.
The frontend was restarted to load the current schema before browser retesting.

## Requirement coverage checkpoint

| Initial requirement | Implementation and evidence | Remaining verification |
| --- | --- | --- |
| Shared wallet identity and stale account/chain fencing | Accepted shared-session milestone; managed workspace suppresses legacy quotes | Final integrated browser pass |
| Selected token metadata and amount integrity | Accepted contract labels, request snapshots and positive uint256 boundaries | Integrated supported route display |
| Native concentrated proposal | Real app and HarnessAgent success with editable exact per-pair prices | Final browser plan preparation |
| Existing exposure | Every known maker group included; direct reconciliation; outside discovery marked unknown | Indexed fill and resume scenario |
| Safe typed model tools | Request-bound wallet, positions, route, configuration and compiler preview tools; no environment access | Final independent runtime evidence review |
| Replacement policy | Exact rational upward-only comparison and confirmed-baseline cooldown; existing policies preserved | HTTP upward-only refusal/acceptance cases |
| External manual account | Named verified Simple7702 adapter, sign-only client, authenticated relay and unconditional receipt proof | Final HTTP closed conversion and review |
| Attribution and exits | Estimates never become attributable inventory; explicit user-reviewed ERC20 quantities; native gas excluded | Final closed conversion browser view |
| Stop and close-only | Stop cancels pending reviews; close request stops management before planning | Browser quote outage and stop timing |
| Browser recurring management | Durable leases, generation fences, takeover and recovery; existing tests | Orca two-tab, sleep, reload and expiry cases |
| Accounting | Recorded transfers and gas retain provenance; unknown attribution and fees remain unknown | Integrated history inspection |
| Privy, MM and Hedera | Explicit later phases with unavailable controls | No Phase 1 deferral of manual LP execution |

## Check status

The full frontend lint and typecheck passed at the current checkpoint.
The full frontend existing test run reached 159 passing, one failing and one skipped before updating the last stale external-capability fixture expectation.
That focused HTTP case subsequently passed.
The runner service suite passed all 16 existing cases.
No unit-test coverage was added after the user prohibited new or expanded unit tests.
Browser work after the user's restriction uses only Orca's embedded browser commands.
Historical Playwright evidence predates that restriction and is not presented as a new run.
Build, final full-suite rerun, final fork artifact and the remaining Orca interaction evidence are still in progress.

## Independent review corrections

The reviewer's real client and authenticated HTTP fork probes reproduced unsupported signing methods leaving a prepared attempt and late signatures being relayed after workspace changes.
The client now releases failures known to precede signing, explicit unsupported-method failures and signed results that have not been relayed when the workspace, provider, account, chain or expiry changes.
It rechecks those facts after signing and before relay.
Ambiguous failures after signing starts remain unresolved.
[Correction evidence](app-review-corrections.json) records failed hashless attempts for unsupported signing and stale signed results, with no public transactions.

The same probes confirmed that native conversion required an explicit wrapped-native target and unwrap instruction, and that resume previously did not require indexed fill coverage.
Native destination selection now maps to those exact semantics in both client and service.
Resume establishes indexing from recorded registration blocks when no start-block environment setting exists, preserves an earlier indexed start and requires current, fresh coverage through the finality target.
The corrected probes return success with current indexed fill coverage and prepare the native conversion successfully.

The full authenticated HTTP fork now includes ordinary replacement and upward-only replacement.
It refuses an unauthorized policy edit and a downward price change, then executes an upward replacement with exact rational prices and nondecreasing bounds.
The initial funding budget is only used for fund-and-open, so replacement uses the current reviewed reserve quantities without replaying the opening purchase budget.
The subsequent close-only and native conversion after closing also confirm through production reconciliation.

[Actual app plan review](app-plan-review.png) shows the native-funded five-call WETH/USDC plan with a fresh simulation and untouched confirmation checkbox.
The original overlay remains separate from committed implementation.
The last shared-workspace run passed 160 tests with one skip; the reviewer confirmed the committed snapshot plus `a424311` has 156 passing tests with one skip because it excludes the user's four additional chart cases.
