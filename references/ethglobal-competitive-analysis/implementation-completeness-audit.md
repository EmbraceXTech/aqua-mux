# Implementation completeness audit

This audit compares the original 439-line LP/MM implementation plan with the accepted implementation and the current audit corrections.
It separates implemented behavior, recorded end-to-end evidence, current gaps, and explicitly later milestones.
Source inspection includes the managed schemas, compiler, lifecycle, signer and external adapter, observation/indexing, review runtime contract, browser management, and public legacy endpoints.
The app owner retains exclusive control of the active app page and servers for the final user journey.
Audit validation uses separate Orca embedded-browser pages and Orca CLI with synthetic accounts and isolated databases or chain forks.
No unit tests were added or run during this audit.

## Initial LP scope

| Requirement | Implementation and evidence | Audit assessment |
| --- | --- | --- |
| Inspectable strategy catalog and separate unavailable MM | `lib/managed/catalog.ts` and managed catalog UI describe LP behavior and keep directional MM and Privy disabled. | Implemented; no fabricated ranking or completed MM claim. |
| Versioned shared configuration, single pair, per-pair fees, deterministic prices | `lib/managed/config.ts` and `lib/managed-compiler/lp.ts` validate distinct families and derive executable price/range economics. | Implemented; existing basket validation remains separate. |
| Fresh wallet balances, selected inventory, shared capital and gas reserve | Managed snapshots, funding planner and lifecycle compiler read balances, conserve integer amounts and retain gas outside trading amounts. | Implemented with authenticated HTTP and full fork evidence. |
| Editable proposal and separate owner authorization | Managed proposal/configuration digests and execution confirmation bind current configuration and run generation. | Implemented; app owner's focused final proposal-wire corrections require their own independent review. |
| Initial native-only two-pair registration | Verified routes buy shortages, fixed minima back conservative registration amounts, and excess output stays in the maker wallet. | Fork evidence covers Ethereum, Arbitrum native and bridged USDC, BNB and verified Robinhood direct routes. |
| Owner-confirmed external wallet mode | Named Simple7702Account adapter checks runtime, owner, exact signed transaction, final freshness, receipt and prestate. | Implemented with controlled EIP-1193 provider evidence; no real wallet brand compatibility claim. |
| Stop, revoke, close and conversion distinctions | Run generation fences unsent work; submitted attempts persist; close docks positions; conversion requires explicit token quantities. | Implemented; Privy signer revocation remains a later disabled capability. |
| Replacement links and atomic rollback | Lifecycle compiler docks selected old strategies and registers fresh hashes in one batch. | Full fork evidence proves old positions and inventory survive a failing replacement. |
| Close-only during route outage | Close requests omit swap dependencies and the UI offers a separate reviewed close-only choice. | Authenticated HTTP and fork evidence accepted in the consolidated review. |
| Explicit group conversion quantities and residuals | Unique token quantities are checked against current balances and group tokens; target assets are deduplicated. | Implemented; exact sweeping and cross-chain consolidation are outside the initial executor. |
| In-app positions, fills and truthful discovery | Position reconciliation separates registration, backing, resolver discovery, fill coverage and unknown fee/performance attribution. | Implemented with resolver-credential fork fixtures and sibling backing changes. |
| Durable records and owner isolation | SQLite records, event history, scoped locks and ownership checks back managed APIs. | Implemented; the existing redacted export function was not exposed by an API at audit start. |
| Complete uninterrupted user journey | Accepted evidence combines real model/UI operation with full multi-pair chain execution. | Final actual app/model two-pair journey is owned by the app E2E worker; a combined claim depends on their recorded result. |

## Corrections made during this audit

`ab1bdf4` fixes public swap plan construction that previously accepted arbitrary API transaction bytes despite displaying minimum receipts.
The Orca browser reproduced two accepted `0xdeadbeef` calls before the correction and verified exact compiled calls with matching receivers and minima after it.
The public builder now uses the same source-attested route compiler as managed execution.
See `public-route-safety-audit.md` and its browser evidence.

`1b14e8e` enables bounded Ethereum transparent routes only after four compiler replays, five semantic/runtime attestations, and browser-driven whole-batch fork simulation.
The verified router, WETH, quoter and two pools have retained source, compiler settings, immutable bindings and complete runtime hashes.
See `ethereum-route-provenance.md`.

`e543164` enables the verified Ethereum account paths after a full two-pair managed lifecycle on an isolated fork.
It covers both resolver fill directions, replacement rollback, exact signed transaction refusal cases, ambiguous relay recovery and production receipt reconciliation.
See `ethereum-managed-execution.md` and `ethereum-adapter-fork.json`.

A further controlled-fork audit reproduced a legacy token-proxy upgrade being incorrectly confirmed.
The proxy-binding correction now captures the recognized legacy implementation slot and checks observed inner-call dependencies during receipt proof.
Changed provenance stays unknown with the retry lock retained, while all five full lifecycle scenarios continue to pass.
See `proxy-binding-audit.md`.

A Robinhood fork also reproduced changed token code being accepted for a replacement with no funding route.
The routeless asset correction now applies the existing source-attested token boundary to entry, replacement, conversion and signing while preserving exact dock-only recovery.
See `robinhood-routeless-provenance.md` for before/after and supported lifecycle evidence.

## Token and route coverage boundary

The dynamic 1inch registry supports Ethereum, BNB, Arbitrum and Robinhood catalog discovery and search.
Selected token metadata is captured per request and checked against on-chain decimals and runtime before configuration or planning.
Registry membership and a successful API quote do not establish permission to execute an arbitrary route program.
The verified compiler supports explicitly attested pools, not every listed asset or opaque executor program.
Ethereum currently has WETH/USDC and WETH/USDT routes; Arbitrum additionally has the separately verified bridged-USDC route; BNB has the attested WBNB stable-token pools.
Robinhood supports only the previously attested WETH/USDG and WETH/PONS direct-pool programs and their verified token dependencies.
The Robinhood aggregation router remains unavailable because authoritative matching source provenance was not established.
No issuer-backed Robinhood USDC or USDT support is invented.
A request outside the verified route set must remain unavailable, even if its token appears in the registry.

## Remaining correctness findings

The legacy public wallet submission path still relies on provider-reported EIP-5792 atomic capability and wallet-reported receipts.
It does not have the managed account adapter's backend authorization, signed-transaction binding and exact receipt proof.
The public plan-construction correction does not close this separate execution boundary.

Active group review snapshots currently read wallet balances and known position backing without attaching current route or market observations.
Only draft intent snapshots populate the route-observation tool.
Recurring concentrated or upward reviews therefore lack a fresh market reference through the supplied tools.
A focused observation module is proposed using verified amount-specific route quotes, with explicit unavailable coverage and existing freshness refusal.

Range-exit and inventory-drift trigger values are labelled as execution-broker enforced by the default policy template, but no corresponding deterministic trigger checks exist in the broker.
Cooldown, allowed actions, expiry and upward-only replacement direction are checked separately.
The grouped trigger label must become truthful or gain complete deterministic enforcement before those signals are presented as broker guarantees.

`cf3c1ce` exposes the credential-redacted `exportOwner` method through authenticated `GET /api/managed/export`.
The Orca browser proved owner isolation, anonymous refusal and exclusion of private internal fixture payloads.
The export download control remains with the app owner for integration and browser verification.

## Later milestones and external limits

Browser-bound recurring reviews, lease takeover, stop during model execution, reload recovery and quota handling have accepted Phase 2 evidence, subject to the active-observation finding above.
Privy delegated execution remains disabled until the separate permission, expiry, revocation and owner-recovery spike passes.
Inventory-aware MM remains unavailable until a distinct supported compiler and fill/expiry suite exists.
Hedera payment and Blocky402 fulfillment remain Phase 5 work; the current entitlement is uncharged development service and does not satisfy a paid-request prize requirement.
Production multi-user inference and PostgreSQL leases remain hosted-service work rather than claims about the local SQLite prototype.
Exact balance sweeping, cross-chain conversion and resolver discovery guarantees are not implemented or promised by this release.

Independent code-quality and correctness review is required for each audit commit before integration acceptance.

## Review queue and integration handoff

The following commits were submitted to the coordinator for independent review in dispatch `ctx_da3b2cc3bd76`.
No independent review result has been delivered for this audit dispatch.
The earlier accepted implementation review does not cover these changes.

| Commit | Owned change | Evidence |
| --- | --- | --- |
| `ab1bdf4` | Public swap compiler and authenticated HTTP driver | Browser reproduction and verified whole-batch fork simulation. |
| `1b14e8e` | Ethereum route manifest, source inputs and compiler replay | Four compiler replays, five deployment attestations and browser fork simulation. |
| `e543164` | Ethereum local and named external account support | Full two-pair lifecycle with controlled EIP-1193 provider. |
| `cf3c1ce` | Authenticated owner export API | Browser owner isolation, anonymous refusal and private payload exclusion. |
| `3608871` | Completeness audit checkpoint | Original plan and current implementation inspection. |
| `c794980` | Existing Ethereum chain expectations | Only existing fixture expectations changed at app owner's request; no new unit tests or unit execution. |
| `2f30621` | Legacy proxy slots and observed execution dependencies | Before/after proxy mutation, pointer refusal before journaling, retained recovery lock and five full lifecycle replays. |
| `e9d7e67` | Robinhood source provenance without funding routes | Changed runtime refused, owner close preserved and supported full lifecycle replay. |

The coordinator owns reviewer dispatch and shared-file assignment.
Ownership question `msg_92fc2e555a85` remains pending after resumed waits and escalation.
The app owner retains the active browser page, frontend, runner and local application database.
No active app state or original funding transaction was changed by this audit worker.

The active observation correction should attach fresh amount-specific pair observations to `WalletSnapshot.routeQuotes` before the review runtime starts, preserve unavailable coverage, and apply the existing post-model freshness refusal.
The policy correction must distinguish enforced upward-only replacement direction from range-exit and inventory-drift signals that currently lack deterministic broker checks.
The public wallet correction needs a stored canonical plan, authenticated named-adapter preparation, exact signed-transaction binding, receipt/prestate proof and durable unknown-attempt recovery before the UI may call it verified execution.
The export UI can consume authenticated `GET /api/managed/export` and download its redacted JSON payload.
These integration items remain open and are not represented as completed by the owned commits above.
