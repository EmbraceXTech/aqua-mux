# Managed LP lifecycle results

Checked September 12, 2026, Asia/Bangkok.
This worker implemented deterministic compilation and planning, plus isolated Arbitrum fork verification.
No live transaction was signed or sent.

## Delivered code and ownership

| Area | Owned files | Responsibility |
| --- | --- | --- |
| Integer compilation | `apps/frontend/lib/managed-compiler/arithmetic.ts`, `lp.ts`, `pricing.ts` | Integer allocation, minimum outputs, sorted pair encoding, virtual opening price, inward square-root bounds, fee and maker deadline. |
| Lifecycle planning | `apps/frontend/lib/server/lifecycle/` | Funding, retirement, replacement, conversion, exact approvals, selected real inventory, fresh RPC reads, provenance, whole-batch simulation binding and residual reconciliation. |
| Focused tests | `apps/frontend/test/lifecycle.test.ts`, `lifecycle-fixtures.ts` | Arithmetic, calldata tampering, gas, expiry, repeated ERC20 spending, range denomination and accounting regressions. |
| Fork verification | `apps/frontend/scripts/verify-fork.ts`, `verify-managed-lifecycle.ts`, `fixtures/LifecycleSwap.sol` | End-to-end fork registrations, fills, replacement rollback, maker expiry and conversion read-back. |

The worker preserved the existing dirty `lib/server/plan.ts`, `lib/strategy.ts`, `lib/wallet.ts`, frontend components and all other workers' files.
It did not edit generated files or changelogs manually.
The normal verifier still writes its own ignored `apps/frontend/verification/fork.json` output.
Core schemas and canonical digests come from the separate core worker's `lib/managed` modules.
API persistence, owner confirmation, generation checks and UI integration belong to the managed-service worker.
The signer worker supplies the production-facing read-only whole-batch simulator and execution adapter.

Focused implementation commits are `afe90f3`, `0409fa6`, `131827d`, `29b1f65` and `bb3fbcf`.
Each commit contains only this worker's files.

## Behavior

`buildLifecyclePlan(request, dependencies)` builds fund-and-open, replace, close or close-and-convert plans against a validated `StrategyConfig`.
The request names explicit selected real inventory, funding purchases, previous managed hashes, conversion amounts, gas reserve and expiry.
Virtual pair allocations never determine how many real tokens may be sold.
Each real token appears once in the inventory ledger, while repeated pair claims share that backing.

Funding reuses existing selected inventory and buys only a remaining shortage.
The funding budget covers both purchases and retained base backing.
Registration amounts must fit existing inventory plus enforced minimum receipts, and excess receipts remain available for reconciliation.
ERC20 route approvals are consumed in the planner's allowance ledger, so repeated purchases receive the required subsequent approval.

Replacement docks old hashes before funding and registration, and records each replacement link.
Closing uses only Aqua docking and remains independent of quote availability.
Conversion accepts explicit group amounts, skips the destination token, checks encoded route minimums and receiver, and optionally unwraps selected wrapped native inventory.
It never silently substitutes sequential transactions for an atomic request.

The compiler validates the displayed opening price against the final executable virtual-reserve ratio.
For concentrated pairs, that ratio includes the encoded range's virtual offsets.
`describeLPPrice(pair)` supplies the exact rational for proposal preparation before review and confirmation.
A previously reviewed mismatching price is rejected rather than rewritten during execution.
Final square-root bounds round inward in either token sort order.
The program retains the resolver credential guard and supports the verified maker deadline instruction.
MM compilation remains unavailable because no deployed directional encoding has passed its gate.

The RPC adapter pins balances, allowances, active strategy reads and code reads to one block.
It compares Aqua and chain-specific SwapVM runtime hashes with the compatibility spike's verified values.
Dynamic registry assets can use the same compiler after the API validates registry membership and risk selection.
The lifecycle independently reads each ERC20's code and decimals at the pinned block, rejects inconsistent metadata, and avoids falling back to the static catalog for dynamic assets.
Plans bind canonical configuration, policy and snapshot digests, exact calls, receipts and simulation evidence.
Expiry cannot exceed the snapshot freshness window.
After simulation, the planner reads balances again and checks selected backing, active retirements and native recovery funds.
The authenticated execution service must still revalidate the current configuration, run generation and authorization immediately before submission.

## Reproductions and validation

The normal `npm run verify:fork` command first reproduced the missing `contracts/TestWallet.sol` fixture.
A temporary local symlink then reproduced the obsolete numeric `range: 20` schema failure.
The committed repair resolves the fixture relative to the script and supplies `{ minPct: -20, maxPct: 20 }`.
The temporary symlink was removed.

Separate code-quality review found an ERC20 allowance consumption error and a concentrated opening-price error.
Both were reproduced through the normal fork command before validating their fixes.
Without consumption tracking, the second equal ERC20 purchase reverted with `ERC20: transfer amount exceeds allowance`.
For one WETH and 2,000 USDC with a 1,000 to 3,000 range, a tiny deployed-router quote returned 1,791 raw USDC units despite a preview based on a 2,000 USDC/WETH reserve ratio.
The corrected compiler derives the virtual price and refuses that mismatching preview.

| Check | Result |
| --- | --- |
| `npx tsx --test test/lifecycle.test.ts` | 17 passed. |
| Focused ESLint including both verifier scripts | Passed with zero warnings. |
| `npm run verify:fork` | 13 checks passed on the isolated Arbitrum fork. |
| Frontend TypeScript | Passed after the auth owner fixed a concurrent test header type error. |
| Combined `npm test` before the final two metadata tests | 100 passed, one opt-in Next auth test skipped, zero failures. |

The fork run at `2026-09-11T20:20:20.070Z` began at Arbitrum block `504162804`.
WETH, Aqua and SwapVM used forked deployed code.
Test wallets, paired-token code, route code and resolver credentials were local fixtures.
The route fixture deliberately uses controlled prices and excess outputs, so its final assets are not a performance or profitable-execution claim.

The fork proves:

- Native-only selected funding purchases two paired assets and retains one real WETH balance shared by both registrations.
- Two equal ERC20-funded purchases replenish their consumed approvals in one successful batch.
- An asymmetric concentrated pair's deployed quote agrees with the reviewed virtual spot within one raw output unit for the small probe, after fee and finite-trade impact.
- The two compiled pairs preserve distinct 5 and 37 bps fee settings.
- Credential-fixtured fills execute in both directions, including maker base outflow that changes sibling backing.
- Failure in the final replacement call restores old active registrations and the exact real inventory.
- Successful replacement records fresh hashes linked to the old hashes.
- A maker quote succeeds at its exact deadline and fails one second later.
- A close-only plan simulates successfully during a route outage.
- Atomic close-and-convert retires both registrations and reads back zero selected paired-token balances.
- Existing verifier checks retain final-swap minimum enforcement and complete rollback of earlier fills and wrapping.

Opening read-back found exactly one extra raw unit each of USDC and WBTC beyond the conservative minimums.
Residual reconciliation reported those excesses separately.
Final read-back showed `3000529963081422759` raw WETH, zero USDC and zero WBTC for this controlled fixture run.
Missing observed balances remain unknown and cause reconciliation refusal rather than being replaced with zero.

The opening hashes were `0xcf88029dad28b50c4dac1dedd2f9970e57604037a55315e6b91a4144e708af42` and `0xacbf8c2a0aa53b03d54af042c0839d57013b352913c1c4e4fbb105079247d531`.
Their replacement hashes were `0x9988a3c9bdaf779fd12d9a7a9852ef3c115cec6f369854278950356c496bf680` and `0x335f24eb7b62b2af10c9576e9d286bede2be36c13419dc5b49861baeb6eeeb09` respectively.
The normal verifier output records all transaction hashes and structured residual data for each rerun.

## Review and remaining boundaries

The separate code-quality reviewer is Orca dispatch `ctx_067b668df2cb`.
Its initial review requested the allowance, concentrated-price, inward rounding, snapshot freshness, unused import and module-split corrections.
The reviewer independently passed the 15-test suite, scoped lint and all 13 fork checks for `131827d` and `29b1f65`.
The coordinator then extended the task to dynamic registry assets, implemented in `bb3fbcf` with two additional metadata tests.
The reviewer accepted the complete scope through `bb3fbcf2fcd29e4f7c1c3bdb3cfc4928734b76a0` and committed its final report in `a92863f`.
Its independent checks passed 17 lifecycle tests, scoped lint, full frontend TypeScript, metadata conflict/refusal probes and all 13 fork checks on port 19485 at block 504164351.
No scoped must-fix finding remains.

The live route adapter currently accepts only a decoded canonical aggregation `swap` call with no partial-fill flags.
Unsupported optimized encodings fail with a refreshable route error.
The coordinator assigned verified transparent-route integration to a subsequent dispatch using the route-policy worker's pending interface.
That follow-up must connect the funded entry and conversion workflow to the signer without accepting opaque executor calldata.
The fork fixture does not establish live 1inch route availability, production resolver discovery, external-wallet batch compatibility or live signer execution.
Fixed conversion amounts can still revert or leave residuals if balances change before inclusion.
The implementation reports read-back inventory and does not claim an exact balance sweep.
User-facing lifecycle acceptance, durable submission recovery and real wallet compatibility remain integration gates owned by the coordinator's other workers.
