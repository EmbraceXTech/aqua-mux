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
