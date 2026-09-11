# Managed lifecycle quality review

Review date: September 12, 2026.
Reviewer owns this report only and made no implementation changes.
Scope includes `apps/frontend/lib/managed-compiler/`, `apps/frontend/lib/server/lifecycle/`, lifecycle tests, and both fork verification scripts.

## Verdict

The reviewed lifecycle corrections pass; final acceptance is pending the coordinator-requested dynamic token extension.
No must-fix finding remains in the previously reviewed files.
The reviewed implementation consists of base commit `0409fa6`, correction commit `131827d43738b9ef2b715f272c5e64be179ffb2b`, and fork verification commit `29b1f6562323f58a45885f23de0d45ee10258af3`.
The owner froze these files for final verification, and a scoped diff against `29b1f65` was empty.
This acceptance does not establish completion of the product UI, caller-side attribution, external-wallet compatibility, or delegated execution.

## Corrected findings

### Bounded opening price

The original compiler checked the raw quote/base reserve ratio against the reviewed opening price for both full and bounded ranges.
Concentrated liquidity adds virtual offsets, so that check did not establish the actual opening price.
The reviewer reproduced acceptance of 1 WETH and 2000 USDC with opening price 2000 and bounds 1000 to 3000, while the installed SDK implied an opening price of about 1792.85953 USDC per WETH.
The owner separately reproduced the discrepancy against deployed SwapVM on the fork.
The corrected `pricing.ts` derives the exact rational spot from encoded virtual reserves, and `compileLP` refuses a different reviewed opening price.
The final fork checks an asymmetric concentrated position against the reviewed price within one raw output unit after fee and small-trade price impact.
Bounded proposal producers must use `describeLPPrice` or construct reserves consistent with the reviewed price before confirmation.
That integration requirement was sent to the coordinator.

### Consumed ERC20 allowance

The original approval builder cached the approved allowance without subtracting route consumption.
Two equal purchases from the same ERC20 funding asset therefore received only one approval.
The owner reproduced an allowance failure on the fork before restoring the correction.
The corrected builder exposes consumption tracking, and each ERC20 route consumes its planned allowance.
Unit tests inspect exact approvals for equal and unequal purchases.
The independent final fork successfully executes two equal WETH-funded purchases and reads back the retained WETH backing.

### Bound rounding and per-pair fees

The original raw-price rounding passed through an SDK square-root floor, which could move the final lower bound outside the reviewed interval.
The corrected compiler directly encodes a ceiling square root for the lower bound and a floor square root for the upper bound.
Tests verify the resulting squared bounds and reciprocal token-order equivalence.
Decoded instructions preserve distinct fees of 5 and 37 basis points.
The final fork uses those different pair fees.

### Snapshot freshness

The reviewer reproduced a successful plan return after simulation advanced the clock beyond the initial snapshot's 30-second freshness limit.
The corrected planner clamps expiry to the initial snapshot freshness deadline, reads and validates another snapshot after simulation, and rejects a final snapshot that predates the simulation block.
It uses the final snapshot for gas sufficiency and the persisted snapshot digest.
The snapshot reader also rejects a stale latest chain block.
A slow-simulation regression now refuses the previously accepted plan.

### Module split and lint

The original main planner combined funding, conversion, registration, route validation, and final simulation checks in roughly 300 lines.
The final index is 205 lines, with funding in a 92-line module and conversion in a 42-line module.
Price arithmetic and concentrated virtual-reserve calculations are isolated in a 74-line compiler module.
Integer arithmetic, inventory accounting, route decoding, snapshots, and call encoding have separate responsibilities.
The unused verifier import was removed, and scoped ESLint passes.
The fork verifier remains a sequential integration scenario with a separate Solidity route fixture; its length reflects setup, execution, and chain assertions rather than product logic.

## Independent final verification

All 15 tests passed with `npx tsx --test test/lifecycle.test.ts`.
Scoped ESLint passed with `--max-warnings=0` across the compiler, lifecycle modules, lifecycle test and fixture, and both verification scripts.
The final fork passed all 13 checks on isolated Anvil port 19484.
The fork began at Arbitrum block `504163162` and completed at `2026-09-11T20:21:48.881Z`.
The verifier ran from a temporary working directory, so it did not overwrite the shared workspace's generated verification report.

The fork proves native and ERC20 shortage funding, conservative receipt accounting, shared WETH counted once, a bounded executable opening-price quote, two-way resolver fills, replacement rollback after a failing final call, successful replacement, deadline acceptance and refusal, route-independent close-only simulation, and atomic close-and-convert with paired balances read back as zero.
WETH, Aqua, and SwapVM use forked deployments.
The wallet, paired token code, resolver credentials, and conversion router are local fixtures.
No real-chain transaction was sent.
These results do not establish compatibility with an unmodified production aggregation route or an external wallet.

Full frontend `npx tsc --noEmit` initially encountered syntax errors in the concurrently edited `test/managed-auth-next.test.ts`.
The reviewer reported that separate failure to the coordinator.
A subsequent independent run passed after the authentication worker's edits settled.

## Accounting and execution boundaries

The planner represents each selected real token once and backs competing virtual claims using their maximum requirement rather than their sum.
Funding credits minimum receipts and keeps retained funding-token backing inside the funding budget.
The gas check reserves native call value, estimated execution cost, and a positive recovery reserve.
Retirements precede purchases and registrations in one atomic batch.
Close-only planning requests no conversion route.
Conversion uses explicitly selected amounts and refuses amounts above selected inventory.
It does not sum virtual allocations or default to selling the entire wallet.
The caller must establish managed-group ownership and resolve ambiguous transfer attribution before providing that selection.

Plans record configuration, policy, snapshot, and call digests, enforce freshness and expiry, and require successful atomic simulation.
Submission-time configuration, lease, authorization, and expiry checks belong to the execution layer and require its separate review.
The residual helper now refuses missing after-balances instead of turning unavailable observations into zero.
Its inputs must share the same selected accounting scope; passing whole-wallet balances as group inventory would misattribute unrelated holdings.
Fixed conversion amounts can still revert after intervening fills or leave excess receipts, so post-transaction observation remains required.
