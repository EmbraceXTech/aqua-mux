# Robinhood token provenance without a swap

The audit reproduced a source-provenance bypass in replacement planning after funded two-pair LP entry and resolver fills on a Robinhood fork.
Changing the PONS runtime while preserving its ERC-20 behavior still produced a successfully simulated replacement because the request needed no funding route.
The previous route-level checks therefore did not establish token provenance for every new LP registration.

The new asset verifier permits only the existing source-attested WETH, USDG and PONS deployments for Robinhood execution.
It checks exact runtime hashes, recognized proxy implementation slots, implementation runtime hashes and the expired PONS transfer restriction against the retained direct-route manifest.
Lifecycle entry, replacement and conversion check this boundary during planning, and the local signer and named external adapter repeat it before signing and broadcast.
The public liquidity planner checks the same boundary, including WETH when the source is native currency.
Unknown registry assets remain discoverable but cannot become executable Robinhood LP plans merely by having code and matching decimals.

Close-only remains available through an exact Aqua dock-only batch.
The exception is derived from decoded canonical calldata, target, zero value and the known SwapVM app rather than a browser-supplied label.
A close changes Aqua accounting without invoking the selected token contract.
The fork demonstrated successful production receipt reconciliation for a close while the changed PONS runtime was still present.
Existing deployment and receipt checks continue to bind the runtime observed for that close.

## End-to-end evidence

All behavioral checks ran through Orca CLI on isolated forks with the public synthetic fixture account.
No public transaction, original wallet key or prior funding transaction was used.
No unit tests were added or run.

`robinhood-routeless-provenance.json` records the before/after reproduction, including the funded entry transaction, source hash mismatch and successful close under the changed runtime.
`robinhood-route-policy-fork.json` records the unchanged verified two-pair entry, resolver fills, replacement rollback, replacement, close-convert, exact receipt proof and ambiguous relay recovery after the correction.
TypeScript checking, focused ESLint and formatting passed for the changed code.

Reproduce the refusal and owner close with `npx tsx scripts/verify-external-adapter.ts --robinhood --asset-provenance --expect-unverified` from `apps/frontend` through an Orca terminal.
Run the supported full lifecycle with `npx tsx scripts/verify-external-adapter.ts --robinhood`.
The public planner hook was inspected in code; this evidence does not claim a separate browser journey for that hook.

Source/compiler evidence remains in the existing Robinhood direct-route provenance artifacts and manifest.
This correction introduces no new token, router or pool provenance claim.
The aggregation router and any asset without authoritative matching provenance remain unavailable.

Ownership is limited to the direct asset verifier, lifecycle snapshot and canonical dock predicate, signer asset check, public verified planner hook, controlled-fork driver and evidence.
Independent code-quality and correctness review is required before acceptance.
