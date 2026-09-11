# Managed LP UI implementation results

The frontend now provides strategy selection, authenticated wallet recovery, fresh proposal inputs, editable pair parameters, execution review, and separate Strategy, Positions, Activity, and Controls views.
The UI consumes managed API records and chain observations; browser state does not establish a confirmed transaction or active position.
This report records frontend evidence separately from the mainnet lifecycle verification owned by the integration worker.

## Ownership and code structure

The UI worker owns `apps/frontend/components/managed/`, `apps/frontend/lib/managed-client/`, managed E2E files, and the integration changes in `components/aquamux.tsx` and `app/globals.css`.
The existing dirty pair-range work was preserved.
No backend source, root manifest, generated token list, or changelog was changed by this worker.

The catalog, proposal form, token selector, config editor, transaction review, observations, indexed activity, and bot tabs are separate components.
Wallet authentication, group polling, lifecycle requests, external execution, recovery, exact numeric inputs, and token search are separate client modules.
AquaMux retains its existing logo, cobalt palette, pale background, multi-swap flow, and pair-specific range controls.
The external Portfolio buttons and confirmation handoffs have been removed.
Mobile navigation now exposes Strategies alongside Swap and Liquidity.

## Implemented behavior

- Catalog cards explain inventory, market conditions, management behavior, and risks without performance rankings.
- Fresh proposal inputs bind maker, network, funding token and budget, gas reserve, permitted paired assets, holding period, and review interval.
- Registry search uses chain and address identity, shows token risk metadata, and distinguishes listing from route availability.
- Proposal submission calls the authenticated token-validation API and displays metadata and route results.
- Exact decimal and rational editing preserves unchanged prices without rounding token amounts.
- Changed suggested configurations can be reviewed and saved before a new agent review.
- Hold, failed, pending, stale-generation, and changed-configuration reviews do not expose an executable plan action.
- Transaction review shows the maker, chain, bound plan digest, calls, minimum receipts, selected inventory, conservative inventory after execution, gas reserve, estimated gas, and simulation block and time.
- The local development wallet is explicitly labelled and requires confirmation for each reviewed action.
- Run, Stop, takeover, reconciliation, close-only, and close-and-convert call backend endpoints.
- Stop remains usable while a manual review request is pending.
- Lease heartbeats continue independently of a slow review response.
- Authenticated records recover after reload, and wallet/session changes discard stale local views and late results.
- Positions show returned registration, virtual allocation, wallet balance, allowance, inventory upper bounds, discovery, fill coverage, and monitoring health separately.
- Activity reads indexed on-chain history directly and separates resolver orders from inventory movements without adding them as separate returns.
- External-wallet execution checks account, chain, and atomic capability before preparing an attempt.
- Explicit rejection, proven pre-send cancellation, and ambiguous submission failures remain distinct.
- Wallet batch identifiers are recovery hints until backend receipt verification establishes the result.

## Verification evidence

The latest managed Playwright run passed all 10 checks in 6.6 seconds.
The managed Playwright suite uses the real local Next server and authenticated backend APIs.
Ephemeral EOA fixtures sign actual authentication challenges and create real draft records through the API.
These fixtures do not submit wallet transactions and do not prove compatibility with a browser wallet product.
The development-wallet test exercises explicit connection and revocation without signing an on-chain transaction.
Transport-race tests deliberately delay responses or inject an HTTP failure and are labelled as UI fixtures.

Run the focused suite from `apps/frontend` with `npx playwright test --config e2e/managed.config.ts`.
Its default endpoint is `http://127.0.0.1:33127`, overridable with `MANAGED_E2E_URL`.
The server must already be running with the required authenticated local development configuration.
The suite covers catalog navigation, preserved pair controls, address-specific registry search, real draft recovery, exact edits, keyboard tabs, Run/Stop, mobile layout, development-wallet connection, delayed review and group responses, revoked authentication, and account changes during pending authentication.

Focused ESLint checks passed for managed components, managed client modules, the AquaMux integration, and managed E2E files.
Repository typechecking was also exercised; concurrent backend test edits produced errors outside UI ownership and were reported to their owners.
The coordinator must use the final repository-wide check when accepting the integrated revision.

Orca browser checks on page `c95d3318-bbd2-4be3-90d6-fad9f99dd580` verified the catalog, configuration view, and explicit development-wallet connection.
The first development connection exposed a Next loopback-origin mismatch, which the authentication and signer owners fixed and the browser retry confirmed.
The mobile E2E check exposed hidden navigation, which was corrected in the UI.

## Screenshots

The following screenshots show real rendered UI.
The strategy and controls screenshots use authenticated draft fixtures, not live filled positions.

- [Catalog on desktop](screenshots/managed/catalog-desktop.png)
- [Draft strategy workspace](screenshots/managed/strategy-draft.png)
- [Stopped management controls](screenshots/managed/controls-stopped.png)
- [Proposal form on mobile](screenshots/managed/proposal-mobile.png)

## Review and integration

Commit `409dce4` introduced the focused managed components and client hooks.
Commit `6005d371` integrated the workspace and removed Portfolio handoffs without committing the pre-existing dirty price-range work.
The independent code-quality reviewer examined component boundaries, exact arithmetic, async state isolation, Stop availability, observation binding, keyboard tabs, and external-wallet recovery.
Corrections were made in the owned frontend files and targeted browser regressions were added.
The coordinator owns final review acceptance and the remaining serialized commit process.

## Evidence limits

This UI work does not establish successful mainnet registration, replacement, fills, close, or conversion.
Those outcomes require the separate lifecycle and mainnet verification records.
External managed transaction submission is disabled unless the backend identifies a verified account adapter.
External authentication, proposal inspection, and record recovery remain available; generic EIP-5792 support alone is not a compatibility claim.
Delegated Privy execution, inventory-aware market making, paid Hedera reviews, and attributable performance remain visibly unavailable.
Unindexed history, missing quote evidence, and uncertain transaction states remain unknown rather than being displayed as zero or confirmed success.

## Resumed proposal validation correction

The resumed worker reproduced parallel validation refusal and stale funding-decimal submission through the actual proposal form using labelled browser transport fixtures.
The new `proposal-validation.ts` helper serializes checks, binds returned chain, addresses and raw amount, and requires verified metadata decimals to match the selected tokens before submitting a proposal.
The form rejects a selection containing only the funding token.
Two focused Playwright regressions passed in 4.2 seconds after the correction.
These fixtures prove client behavior, not live route execution or model success.
Scoped managed ESLint passed.
A concurrent whole-app typecheck found backend fixture errors and a legacy TokenResolver call mismatch, which were routed to the corresponding owners for integration correction.
An Orca catalog snapshot succeeded during the E2E owner's granted browser window; the existing screenshots remain the visual evidence.
The independent UI reviewer found the focused helper split and validation guards appropriate during static review.
The token selector now explains when results are capped and asks the user to narrow the query.
