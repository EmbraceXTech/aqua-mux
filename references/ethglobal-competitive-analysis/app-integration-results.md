# App integration results

The initial managed LP application and browser review loop are implemented through app source commit `89c24d64d730818a18fff0af3bccd2b66538ad86`.
The real application produced and reviewed a native-funded concentrated LP proposal through the actual HarnessAgent runner.
Authenticated production HTTP and controlled-provider fork checks cover entry, replacement, close-only, conversion after closing, and receipt recovery.
No public-network transaction was submitted during this implementation run.
The funded development wallet, its funding journals, and the original user chart overlay were preserved.

## Ownership and independent review

This worker owns the consolidated app, managed UI/client, legacy authentication and token integration, model tools, and managed service integration.
The chain worker owns lifecycle compilation, routing, development signing, external account verification, and transaction proof.
The README belongs to the separate documentation worker.
[Consolidated quality review](consolidated-quality-review.md) records independent source, maintainability, test, browser, and fork checks against pinned revisions.
Original reports remain separate, and no unrelated files were included in these commits.

| App milestone | Change | Evidence |
| --- | --- | --- |
| `de0c0e0` and `3e0defe` | Contract-authoritative labels, exact positive uint256 quotes, compatible existing fixtures | Accepted metadata review and existing regression suite |
| `7e8c60b` | Shared authentication, stale account/chain fencing, registry selection, managed-view quote suppression | Independent Orca authentication and legacy quote/plan review |
| `e032fd1` | Deterministic upward rules and cooldown, explicit exit inventory, mandatory transaction proof | Source split review and later production HTTP fork |
| `01c7511` | Request-bound model tools, native proposal preview, known maker exposure | Real HarnessAgent records and independent runtime inspection |
| `4a7b1e1` and `a424311` | Named account integration, exact editor and native exit UI, HTTP fork harness, final legacy fixture correction | Independent app and fixture review |
| `e2bc73b` | Late-signature fences, current indexed resume, replacement funding, indexed movement display | Independent full checks and four corrected HTTP fork reproductions |
| `a20c830` | Refresh browser ownership after rejected heartbeat | Independent source review and actual two-tab browser evidence |
| `89c24d6` | Release hashless prepared attempts after completed relay refusal | Other-tab Stop during signing reproduced through production client and authenticated HTTP |

Every implementation milestone was submitted separately for code-quality review.
The maintained boundaries separate proposal validation, scoped client state, external signing, HTTP attempt handling, deterministic management rules, and indexed movement display.
No new or expanded unit tests were added after the user prohibited them.
Existing fixtures were corrected where the inherited route schema had changed.

## Actual application and model

The Orca embedded application runs at `http://127.0.0.1:33127/` with the authenticated runner on port 33128.
[Runtime evidence](app-live-runtime-evidence.json) includes request identity, immutable wallet and quote observations, model result, and durable tool events.
Authentication tokens, provider credentials, and signing material are excluded.

Request `84237790-366b-4d3b-bccf-91ad67538e31` completed in 29,670 milliseconds and created an editable WETH/USDC group from 0.0001 ETH with a separate 0.0005 ETH gas reserve.
The registry label was USDC_1 and the verified contract symbol was USDC, with matching six decimals.
Request `244405e1-ffc8-4a56-9029-4b90a8cbe0db` completed in 27,407 milliseconds after a fee edit and save.
Its fresh review preserved the saved configuration and returned fund-and-open.
Both requests recorded the actual proposal_preview tool invocation inside HarnessAgent using Codex and gpt-6-astra.
These are observed durations for two requests, not latency targets.

The typed tools expose only request-bound wallet, known positions, route observations, configuration, and deterministic preview data.
The model receives no secret environment or signing capability.
Known groups for the maker are reconciled and included in exposure; incomplete external discovery remains explicitly unknown.
The compiler preview preserves integer budget conservation and exact rational prices.
Five-basis-point fees and twenty-percent initial bounds are editable defaults, not inferred optima.
Earlier model attempts that outlived quote freshness were rejected without an executable review.
Freshness was not relaxed to obtain a passing proposal.

[Actual app plan review](app-plan-review.png) shows the native-funded five-call plan, selected inventory, gas reserve, fresh simulation, and an untouched confirmation checkbox.
Editing the exact numerator/denominator price or UTC program expiry invalidates previous reviews and plans.
A stale Next development-store schema initially rejected the chain worker's new deploymentEvidence field; restarting the frontend loaded the current schema and restored successful plan preparation.

## Requirement matrix

| Requirement | Implemented behavior and evidence | Boundary |
| --- | --- | --- |
| Catalog and initial intent | Managed concentrated and upward-only LP, chain, funding asset, budget, reserve, permitted assets and interval; real native proposal | MM, delegated signing and Hedera remain explicit later milestones |
| Authentication and owner binding | Shared bearer session, owner-scoped records, expiry and 401 recovery, account/chain/request fencing | Independent legacy and managed UI reviews |
| Token selection and metadata | Full registry selection resolves authoritative contract code, decimals and symbol; request snapshots survive cache refresh | Registry membership alone does not establish an executable route |
| Dynamic quote and plan routes | Legacy TokenResolver migration and managed verified funding-route preflight; native wrapping handled separately | Unsupported liquidity returns named unavailability without silently changing assets |
| Proposal and configuration | Actual model tool call, exact per-pair price and fee editing, program expiry, save and fresh review | Owner must review the deterministic plan before execution |
| Exposure and inventory | Direct current reconciliation for known maker groups, common wallet backing, explicit discovery coverage | Unknown external exposure is not fabricated as zero |
| Open and replace | Whole-batch funding, registration, replacement and rollback through production compiler and relay | Public execution excluded from this run |
| Upward-only and cooldown | Exact comparison with confirmed baseline; downward moves, premature replacement and unauthorized policy widening refused | Fork baseline timing is a labelled deterministic fixture |
| External manual account | Named simple7702-self-signed-v1 capability, account-code verification, sign-only client, authenticated relay and receipt proof | Controlled provider evidence is not a MetaMask compatibility claim |
| Stop and signing races | Stop cancels in-flight model work, fences old generations, and keeps submitted attempts recoverable | Ambiguous transport outcomes remain unresolved until reconciliation |
| Close-only and quote outage | Separate close plan remains available when conversion quoter is unavailable | Independent outage fork confirms close before later conversion |
| Conversion and attribution | Explicit positive quantities checked against fresh balances; no estimates treated as attributable inventory | User chooses quantities when shared ownership is ambiguous; unrelated assets are not selected automatically |
| Conversion after closing | Closed group permits fresh reviewed token quantities and wrapped-native plus unwrap destination | Full HTTP fork confirms later native conversion |
| Browser management | Explicit recurring consent, periodic reviews, Hold, one lease, takeover, Stop and page recovery | Navigation loss exercises missing heartbeats; physical device sleep was not performed |
| Resume and fill reconciliation | Registration-derived start block, finality target and fresh indexed fill coverage required before resuming | Unknown imported histories stay blocked until coverage is established |
| Outage and restart recovery | Existing timeout, quota, stale-data, cancellation and SQLite restart checks pass; actual stale quotes pause safely | Controlled existing tests supplement real browser observations |
| Positions and accounting | Registration, backing, discovery, fill events and coverage remain separate; exact indexed Aqua movements counted once | Marked net performance, realized/unrealized results and fee decomposition remain unknown when evidence is insufficient |
| Multi-pair and multichain behavior | Chain owner's real-code forks cover two pairs, forward/reverse fills, sibling depletion and replacement rollback | Resolver credentials are labelled fork fixtures; no public resolver discovery claim |

## Execution evidence

[Authenticated HTTP fork evidence](app-http-fork-results.json) records confirmed entry, ordinary replacement, upward replacement, close-only, and native conversion after closing.
The script uses production authenticated handlers, planner, sign-only relay and receipt reconciliation on an isolated real-code fork.
It never writes a confirmed transaction state directly.
The opening review is a deterministic fixture that isolates execution from model variability; actual model evidence is recorded separately.
Replacement uses current reviewed reserves and does not replay the initial funding budget.
Unauthorized policy changes, downward movement, active cooldown and missing inventory review are explicitly refused.

[Correction evidence](app-review-corrections.json) covers unsupported signing, stale workspace after signing, other-tab Stop during signing, native destination normalization and resume without a configured index start.
Known pre-relay failures leave failed hashless attempts.
Completed relay refusals release only attempts still prepared without transaction, batch or provider identifiers, using the same supplied store and a transactional guard.
A durable submission or transport-ambiguous result remains recoverable.

The independent reviewer replaced the pinned quoter only on a disposable fork to reproduce route_unavailable.
Conversion returned HTTP 503, close-only still confirmed, and restoring the quoter allowed later native conversion from the closed group.
Exact local transaction hashes and source revisions are recorded in the consolidated review.
The chain owner's separate reports provide the two-pair observed-fill, shared-backing, exact minimum-output and rollback evidence across Arbitrum, BNB and Robinhood Chain.

## Browser evidence

[Browser control evidence](app-browser-evidence.json) records actual Orca interactions and selected durable runner state.
The test opened the same group in two embedded tabs, resumed recurring reviews, explicitly took over from the other tab, and stopped management.
Before the heartbeat correction, the former owner repeatedly received stale_generation.
The corrected controller refreshes ownership after the first refusal and stops issuing obsolete heartbeats.

Navigating the owning page away removed its heartbeat source.
The second visible tab showed Paused with the lease-expired reason after the 45-second lease elapsed.
Reloading the original page and opening the saved group preserved that paused state and exposed reconcile/recovery controls.
This tests real heartbeat loss and reload; it does not claim an operating-system sleep experiment.

Actual model request `53e1dc98-34a1-4bfd-a170-17df1c36aaa0` was cancelled by Stop while inference was running.
Its durable record is cancelled with review_cancelled after 27,537 milliseconds.
Stop left passive-position behavior explicit and did not manufacture a closed position.
No public transaction confirmation was clicked.
Browser automation after the user's restriction used only Orca embedded commands.
Historical Playwright runs in earlier reports predate that restriction.

## Final checks and limits

[Final verification summary](app-verification-summary.json) records passing full shared-workspace frontend lint, typecheck, existing tests and production webpack build after the final attempt-handler correction.
The shared workspace contains 160 passing tests and one intentional skip.
Independent pinned-source verification has 156 passing tests and one skip because the original uncommitted chart overlay contributes four additional cases.
The runner full npm test passes 13 runtime cases and 16 service cases, with three intentional runtime skips.
Runner strict service typechecking also passed independently.
The HTTP fork and independent correction/outage probes passed with zero public transactions.

The production build regenerates Next's next-env.d.ts route reference; that generated file is excluded from commits and is never manually edited.
The app starts through the reviewed explicit development-wallet startup flags, with the original .env untouched and no private key passed to the runner.
Personal agent inference remains uncharged development usage, with unknown cost shown as unknown.
Privy delegation, bounded MM and Hedera settlement are later phases, not claimed complete here.
A separate reviewed live execution slot is required for public-chain receipts and a named real-wallet compatibility claim.
