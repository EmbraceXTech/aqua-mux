# Resumed app acceptance

The requested app corrections are committed and verified through Orca's embedded browser.
No public transaction was submitted, no funding was replayed, and no unit test was added or modified.
The frontend and runner remain healthy on ports 33127 and 33128 with the original isolated development wallet environment.

## Changes and ownership

| Commit | Owned change | Evidence |
| --- | --- | --- |
| 0540b99f504b5a2bc3ba15b365ff1e912a394015 | Owner export control and truthful trigger labels. | Actual authenticated download and advisory signal display in the app. |
| d229ffda5bf0362b7d972181c72002645070025c | Owner-scoped saved proposal summaries, reload recovery, and opening the reviewed group. | Actual saved review to group, Run, Stop, and reload journey. |
| 759b72ee7f4e5a70b7938f352b1f11954d80d8bf | Shared public receipt classification and all confirmation displays. | Local incomplete receipt reproduced false confirmation before the fix and unknown execution afterward. |
| 1d4e64c788e4ed4daae9f34d3c33428cf05ad76a | Include validated proposal reviews without groups in redacted owner export. | Actual download contains 12 proposal reviews; anonymous export returns 401. |

The observation implementation belongs to the chain owner and landed as e83fa9e.
This dispatch removed its uncommitted observation module and fixture assertions after the ownership redirect.
No observation source or fixture assertion was retained in an app commit.
The Ethereum assertion correction was already present in c794980 and needed no further edit.

## Public false confirmation

The Orca browser seeded a clearly labelled local transaction record containing only status 200, without atomicity, receipts, or a transaction hash.
Before the correction, the transaction activity list displayed Confirmed.
After the correction, that same record displayed Check status and its modal said Execution is unknown.
The correction requires an explicitly atomic result, nonempty successful receipts, and valid nonzero 32-byte transaction hashes before presenting confirmation.
Pending and unknown outcomes block another submission and remain eligible for status polling.
The original browser transaction records were restored after this local fixture.
This is UI classification evidence, not a real wallet transaction or independent public-chain receipt proof.
No external wallet brand compatibility is claimed.
The separate public backend authorization and exact transaction-proof boundary remains outside this client correction and must not be represented as solved by a wallet-reported result.

## Saved review and group lifecycle

The authenticated Strategies view recovers compact saved proposal summaries from owner-scoped durable documents.
Pending records refresh while waiting; expired pending records display a cancelled deadline outcome.
Failed records show their error without successful proposal rationale.
Open reviewed group navigates using the persisted group identifier.

The actual browser opened saved group 4754a8b7-2063-4184-9a12-223d5baf7e61, then opened Controls and consented to recurring reviews.
Run returned running generation 1 at 2026-09-12T05:36:21.151Z.
Stop returned stopped generation 2 at 2026-09-12T05:36:30.467Z.
Reload and the saved-review link recovered Stopped state.
This was a local lifecycle transition of an existing draft, with no chain transaction.
The earlier real two-pair HarnessAgent proposal and controlled fork execution evidence remain in integrated-acceptance-results.md.
No new model-completion or in-flight cancellation claim is inferred from this short Run and Stop sequence.

## Export completeness and labels

Download my records consumes authenticated GET /api/managed/export and checks the active session before creating the download.
The export now includes schema-validated proposal review records from the owner's proposal documents, including reviews that never created a managed group.
The actual download contained 12 proposal reviews, including eight failed reviews without managed groups.
Snapshots and internal documents remained excluded.
An anonymous request from the Orca app page returned 401 with Authentication required and no exported records.

Range-exit and inventory-drift thresholds are presented as advisory review signals.
Upward-only replacement direction is described separately as broker-enforced when enabled.
The display does not trust older grouped enforcement labels as proof that every trigger is enforced.
Existing policy values were preserved, and new policy templates label the grouped signals advisory.

## Validation and review

The existing frontend suite passed 160 tests with one skip and no failures.
Lint, TypeScript checking, and the production build passed after the source corrections.
The evidence JSON records local log hashes and the exact browser observations.
No Playwright or other browser automation was used.

Every commit used the repository lock, a fresh private index, exact owned paths, backups, and unrelated-index verification.
The AquaMux receipt correction used a HEAD-based transform in the private index to exclude the original dirty chart overlay.
All unrelated dirty files remain preserved.
No generated file, CHANGELOG, or README was modified by this dispatch.

Independent review was requested for all source commits and is requested again with this evidence commit.
Review acceptance is coordinator-owned and is not asserted by this report.
The request to finish the client correction, export evidence, and hand off was received in msg_b359ffaeb005.
