# Managed policy and external wallet quality review

## Scope and ownership

Dispatch `ctx_ba074e0d2219` independently reviews the follow-up replacement policy and backend external-wallet execution contract.
Implementation belongs to dispatch `ctx_73902e503cfe`.
The reviewer owns this report and the final appendix in `automation-api-quality-review.md` only.
The earlier API acceptance at `645c892bce30b8cafeb59fe75666ab190aa94c0e` remains limited to its recorded scope.

## Initial findings

The proposal policy excludes `replace` for every recipe, although the managed concentrated and upward-only catalog entries list replacement.
The review service rejects a replacement decision outside that policy before a plan can be created.
Adding an action must preserve recipe-specific restrictions and the exact configuration consent path.
The current planner requires the proposed configuration to match the saved configuration, so a changed proposal requires an explicit edit followed by a fresh review.
That edit pauses the bot and advances its generation.
An old review cannot authorize a plan after the edit.

The upward-only trigger is labelled advisory, and the reviewed lifecycle guards do not compare previous and proposed ranges.
Enabling upward-only replacement requires a deterministic direction check or an explicit refusal with an accurate capability explanation.
The owner was notified before enabling additional actions.

The external-wallet client checks the provider's atomic capability but does not establish a supported receipt or execution-proof format.
The API accepts a prepared attempt without any verified adapter contract.
A successful reported atomic batch with two distinct receipt hashes remains submitted with a null transaction hash.
Reconciliation has no hash to inspect, rejection is refused, and Resume remains blocked.
A new external attempt must be refused before journaling or reserving a wallet lock unless its adapter has a verified recovery contract.
Existing ambiguous attempts must retain their recovery records and locks.

## Independent reproduction

The temporary harness `/tmp/aquamux-policy-capability-review.ts` calls the actual `managedApi` handler with a fresh wallet authentication proof and an in-memory store.
It uses a labelled lifecycle fixture to prepare a confirmed plan, submits a fixture batch identifier, and reports two distinct transaction hashes with atomic status 200.
The API accepts the status but retains a null transaction hash and submitted status.
The harness then verifies that rejection returns 409 and Resume returns `recovery_required` after Stop.
Authentication, two-tab fencing, explicit pre-submission rejection recovery, and interrupted-review retry assertions also pass.

```sh
cd apps/frontend
ARBITRUM_RPC_URL=http://127.0.0.1:1 npx tsx /tmp/aquamux-policy-capability-review.ts
```

This reproduction uses no RPC requests, real wallet secrets, inference calls, or transactions.
It establishes the authenticated API defect rather than browser rendering or live wallet compatibility.
The coordinator's E2E owner separately owns the real replacement UI reproduction.

## Acceptance gate

Follow-up acceptance is pending the owner's exact correction commit and independent verification.
Required evidence includes recipe action selection, the edit and fresh-review replacement path, unsupported external attempt refusal without a journal or lock, consistent catalog and group capability responses, and continued recovery of existing attempts.
The internal development signer must continue to prepare its verified execution path.
Client-supplied capability claims must not override backend policy.
Module organization, scoped lint and formatting, relevant regression tests, and committed file identity will be reviewed before acceptance.

## External capability acceptance

The backend external execution contract is accepted at exact commit `7a2f7534ea1b998701258737c1f54c78493c32f9`.
The accepted paths are `managed-service/external-capability.ts`, `managed-service/http.ts`, and `test/managed-api-http.test.ts` under `apps/frontend/lib/server` or `apps/frontend/test` as applicable.
The focused capability module owns the refusal reason and immutable advertised state.
The HTTP dispatcher authenticates ownership before refusing new attempts, while keeping existing submission and wallet-status recovery endpoints intact.
The internal execution service remains separate for the development signer.
This split fits the existing service structure and does not duplicate adapter logic in the route.

An isolated archive at `/var/folders/x3/4w6qlmgx7ss4zsvzcjq7592m0000gn/T/aquamux-policy-review.u6n47xx2` passes all five tests in `managed-api-http.test.ts` and `managed-execution.test.ts`.
Scoped ESLint and Prettier pass for all three changed files.
The independent `/tmp/aquamux-policy-capability-repaired.ts` harness confirms authenticated external refusal before journaling, continued internal preparation, explicit rejection recovery, and preservation of historical ambiguous receipt records.
A historical unsupported multi-receipt attempt remains unresolved because the repair must not invent chain evidence.
No new unsupported execution is admitted through the external attempts API.

The full frontend typecheck fails in unrelated committed `test/route-policy.test.ts:28` with TS2769 because `assert.throws` receives `RegExp | undefined`.
This was routed to the coordinator for correction by the route-policy owner.
The capability acceptance is scoped to the three reviewed files and does not claim a clean integrated typecheck or a working live external-wallet adapter.
Replacement policy acceptance remains pending separately.
