# Managed UI quality review

Review date: September 12, 2026.
Initial source revision: `409dce4`.
Review ownership covers `components/managed/**` and `lib/managed-client/**` under `apps/frontend`, with read-only inspection of their server contracts and app integration.
This reviewer owns only this report and makes no application source changes.
The integration worker owns fixes, application integration, and E2E evidence.

## Initial verdict

Changes are required before integration acceptance.
The components have useful boundaries, but exact editing, session isolation, execution contracts, and recovery contain workflow defects.
The findings below were sent to the coordinator as they were identified.
Some execution-contract corrections are already visible in the shared working tree, but an uncommitted change is not final acceptance evidence.

## Findings requiring correction

| ID | Priority | Location | Finding and required correction |
| --- | --- | --- | --- |
| UI-01 | High | `config-editor.tsx`, `format.ts` | The editor initializes prices through the display formatter, which truncates to eight decimals or returns a rational fraction that the decimal parser rejects. Preserve original rational values when unchanged and parse explicit edits without silent precision loss. Cover tiny prices and repeating rational values. |
| UI-02 | High | `managed-workspace.tsx`, managed client hooks | Account changes clear authentication but leave group selection, cached detail, proposals, and pending plans alive. Async refresh and action completions lack scope guards. Reset or key all state by authenticated session and group, abort eligible requests, discard late completions, and recheck scope before signing. |
| UI-03 | High | `use-managed-actions.ts` | Initial planning omitted lease identity and generation. Initial local execution created an attempt before the signer created another, and the external path posted submission data to the preparation endpoint. Match the exact server contracts, pass lease context through every relevant stage, and prove one durable attempt per operation. |
| UI-04 | High | `controls-view.tsx`, client action state | Shared busy state disables Stop during a manually requested model review or plan operation. Stop must remain reachable with its own pending state and invalidate late review or plan results. |
| UI-05 | High | `api.ts`, `positions-view.tsx`, `activity-view.tsx` | Group detail returns persisted observation evidence, but the client drops it and displays a direction to see reconciliation evidence without showing it. Surface current backing, observation coverage, errors, timestamps, and available movement amounts without presenting a planned inventory as an observed balance. |
| UI-06 | High | `plan-review.tsx` | Confirmation omits available inventory-before, conservative inventory-after, gas reserve, gas estimate, and simulation evidence. Display the managed inventory scope, conservative residual expectations, and gas facts before exact confirmation. |
| UI-07 | High | `use-managed-actions.ts`, server reconciliation boundary | External submission stores only a wallet batch ID, but server reconciliation requires a transaction hash and verifies a development batch encoding. Rejected wallet prompts leave prepared attempts with no usable recovery path. Implement supported recovery and unknown-state handling, or visibly disable external managed execution until it is verified. |
| UI-08 | Medium | `bot-workspace.tsx` | Custom tabs declare tab roles without roving focus or arrow-key behavior. Use the existing accessible tab primitive or implement Arrow, Home, End, and correct tab stops. |
| UI-09 | High | `bot-workspace.tsx`, `strategy-view.tsx` | The plan button chooses an action from group state, while subsequent reviews can return hold, pause, or a changed configuration. Show the actual proposed configuration with an explicit apply-and-invalidate action, and enable planning only for a current executable review decision. |

## Component and module boundaries

The initial implementation separates catalog, proposal form, editor, confirmation, positions, activity, controls, and wallet display.
The client also separates session authentication, group refresh and heartbeat, and lifecycle actions.
These are useful responsibility boundaries and do not need consolidation into `aquamux.tsx`.
Corrections should preserve these boundaries, with focused helpers for exact price editing, scoped requests, and execution recovery if those responsibilities grow.
Keep catalog capability truth in the shared catalog rather than maintaining independent availability flags in the presentation data.
Use the existing logo, palette, and pair-chart controls in the surrounding application.

## Evidence and acceptance boundary

The implementation plan and applicable frontend agent instructions were read.
Static review compared the initial UI revision with the current managed API, execution broker, local signer, reconciliation service, and wallet adapter.
The initial revision uses an explicit confirmation checkbox, shows the maker and chain, and does not fabricate returns or enable delegated execution or MM.
Those useful safeguards do not resolve the findings above.
Visual review requires an exclusive Orca browser window from the integration worker before this reviewer touches `page33127`.
Final acceptance requires the integration worker's exact commit, corrected source review, and relevant E2E evidence.

## Initial visual and lint checks

Scoped ESLint passed for `components/managed` and `lib/managed-client` before the integration corrections finished.
The integration worker granted exclusive access to Orca page `c95d3318-bbd2-4be3-90d6-fad9f99dd580` at `http://127.0.0.1:33127/`.
The catalog screenshot retained the AquaMux logo, blue navigation and buttons, consistent cards, and readable desktop spacing.
The page displayed an existing same-origin loopback request error for development-wallet connection.
A Configure strategy click returned an accepted receipt, but the next snapshot still showed the catalog.
The subsequent wait and evaluation returned `runtime_unavailable`, stating that the Orca runtime closed the connection before responding.
The browser window was released to the integration worker after that failure.
Authenticated workspace interactions and mobile layout remain unverified by this initial visual check.
Direct assertions against the new numeric-input helper passed for `1/3`, `1/1000000000000`, `123456789123456789/100000000000000000`, and unreduced `2/6` rational round trips.
The same check confirmed rejection of excess token decimal precision and zero prices.
This validates the helper correction in the working tree, pending a final source revision and editor interaction evidence.

## Correction review and independent verification

Integration commit `6005d371cd9911d4a3f0db6b0d97b6d4b6af2091` adds managed navigation and removes portfolio handoffs without absorbing the existing pair-chart work.
The corrected UI separates session-scoped content from group-scoped controllers and adds focused numeric-input, token-search, external-execution, wallet-recovery, observation, and indexed-activity modules.
The component boundaries remain suitable for maintenance.
The editor preserves unchanged rational prices, and proposed configuration changes require explicit save before a fresh review can authorize planning.
Current successful review decisions control planning availability.
Stop has independent pending state, invalidates pending plans, and remains usable during a manual review.
The group controller suppresses plans from an old run generation.
Authentication has expiry recovery, session-specific HTTP invalidation, and a generation check that rejects authentication completed after an account change.
Confirmation now displays selected inventory, conservative post-execution inventory, gas estimate and reserve, and simulation evidence.
The positions view reads actual reconciliation data, and `observed-activity.tsx` consumes the returned indexed event history with separate order amounts and inventory deltas.
The indexed activity display does not add those quantities together as returns.

The reviewer independently ran `npx eslint components/managed lib/managed-client e2e/managed*.ts --max-warnings=0` successfully after the token-search extraction cleanup.
The reviewer independently ran `npx playwright test --config e2e/managed.config.ts`, with 10 tests passing in 7.0 seconds.
These tests cover Stop during a delayed review, late group loading after disconnect, HTTP 401 recovery, account changes during delayed authentication, durable draft recovery, exact unchanged editing, keyboard tab behavior, ordinary Run and Stop, registry identity and uncertainty, mobile overflow, and explicit development-wallet connection and revocation.
The transport-fault cases use labelled browser fixtures around real authenticated records.
They do not claim live wallet transaction execution.

The reviewer inspected the integration worker's [stopped Controls screenshot](screenshots/managed/controls-stopped.png), [mobile Proposal screenshot](screenshots/managed/proposal-mobile.png), and [draft Strategy screenshot](screenshots/managed/strategy-draft.png).
The screenshots preserve the app branding and show readable fields, consistent spacing, and no observed horizontal overflow.
The desktop screenshots show persisted test draft records, without executed positions or fills.

## Remaining integration checks

External wallet recovery now retrieves batch receipts, preserves nonauthoritative reload hints, and separates known pre-send refusals from ambiguous send failures.
However, the inspected backend still verifies confirmed execution only against the development self-call batch encoding.
Generic EIP-5792 atomic support is insufficient to prove that the backend can reconcile that wallet's account format.
The UI now disables confirmation unless the backend advertises a verified external adapter and repeats the gate in the action hook before confirmation or attempt mutation.
The current backend advertises no such adapter, so external mode remains limited to proposals and record recovery.
This resolves UI-07 by refusing unverified execution, rather than establishing external-wallet execution compatibility.
The independent token-integration reviewer identified a separate cross-path issue in the new proposal route checks, where parallel client validations conflict with the API's single active validation per owner.
That reviewer also requested binding budget parsing to freshly verified funding-token decimals.
The UI implementation worker owns the corrections, and the token-integration reviewer owns their cross-path acceptance.
The final correction commit and resumed review are recorded below.
The complete live signed LP lifecycle, two-tab lease takeover, device sleep, lease expiry, and ambiguous wallet recovery remain separate release evidence requirements beyond the tests reported here.

## Final managed correction review

Reviewed correction commit `a62c8fcc6a760d7a6b8a9a196e62633a054fbfff`.
Its 31-file manifest contains the managed component and client corrections, their browser tests, and the implementation owner's results report.
The managed components and client files in the working tree matched that commit during this review.
The separate legacy quote and plan authentication integration is outside this commit and requires its own review.

All nine initial UI findings are resolved within the stated manual-development and externally gated execution scope.
This acceptance does not establish external wallet execution compatibility.
The component and hook boundaries remain focused, and the correction does not absorb the original pair-chart implementation into the managed workspace.

The R5 correction extracts proposal funding validation into `lib/managed-client/proposal-validation.ts`.
It validates paired assets sequentially to respect the API's single active validation per owner.
Each result must match the selected chain, source address, destination address, and raw funding amount.
Verified registry and on-chain decimals must match the selected token metadata before the form submits the proposal.
Decimal drift produces a visible error and requires reselection instead of silently changing the user's budget.
Current-input checks before and after each request reject stale validation responses, and a selection containing only the funding token is refused.
This separation keeps validation contracts out of the form's rendering logic.

The implementation owner reported that both new labelled browser regressions reproduced the old defects and passed after correction in 4.2 seconds.
The tests exercise two paired assets against a single-active-request fixture and a changed funding-decimal response through the actual form.
They assert a single proposal with the expected raw budget in the first case and no proposal in the drift case.
The reviewer inspected those tests and independently passed `npx eslint components/managed/proposal-form.tsx lib/managed-client/proposal-validation.ts e2e/managed-proposal.spec.ts --max-warnings=0`.
The prior independent 10-test run and accepted Orca visual evidence remain applicable to the unchanged flows.
No wallet transaction was submitted by this reviewer.

No additional blocking code-quality or usability finding remains in the reviewed managed component and client commit.
The coordinator retains responsibility for cross-path R5 integration acceptance, final repository checks, and the separate funded lifecycle evidence.
