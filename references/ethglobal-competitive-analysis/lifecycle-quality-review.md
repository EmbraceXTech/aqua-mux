# Managed lifecycle quality review

Review date: September 12, 2026.
Reviewer owns this report only and made no implementation changes.
Scope includes `apps/frontend/lib/managed-compiler/`, `apps/frontend/lib/server/lifecycle/`, lifecycle tests, and the managed fork verifier.

## Verdict

Must fix before acceptance.
The implementation owner is addressing findings, and a final verdict requires inspection and tests on the exact final focused commit.
Initial inspection covered the working tree while the owner prepared commit `0409fa6` and subsequent changes.

## Findings

### P1: Bounded LP reserves do not encode the reviewed opening price

`compileLP` checks the raw quote/base reserve ratio against the reviewed opening price for both full and bounded ranges.
Concentrated liquidity adds virtual offsets, so this check does not establish the actual opening price.
Using the lifecycle WETH/USDC fixture with 1 WETH, 2000 USDC, opening price 2000, and bounds 1000 to 3000 succeeds in the compiler.
The installed SDK's `instructions.concentrate.computeLiquidityAndPrice` applied to the compiled sorted amounts and encoded bounds gives an implied price of 1792.859529899711 USDC per WETH.
This changes the economic meaning of the reviewed position.
Derive and verify concentrated reserves using the deployed instruction's math, or refuse unsupported configurations.
Add a fork quote assertion for an asymmetric bounded range and reversed token order.

### P1: Sequential ERC20 purchases reuse consumed allowance

`approvalBuilder` caches the allowance it approved without subtracting amounts consumed by route calls.
Two equal purchases from the same ERC20 funding asset therefore emit one approval, although the first swap consumes it.
The second swap then fails in an atomic simulation or transaction.
The original fork funding case uses native ETH and cannot catch this behavior.
Track consumption or approve a correctly bounded aggregate amount, and test equal and unequal repeated purchases with an allowance-enforcing token.

### P2: Encoded lower-bound rounding needs verification

The compiler rounds the raw lower price upward and describes this as rounding inward.
The SDK's `ConcentrateGrowLiquidity2DArgs.fromRawPrices` then floors the square root.
The final encoded lower square can fall below the raw lower bound supplied to the SDK.
Use a ceiling square root for the lower bound and verify the final encoded interval against the reviewed rational prices.

### P2: Regression coverage and lint

The initial compiler test checks a deadline opcode prefix, fresh hashes, and a raw reserve mismatch.
The initial managed fork uses full ranges and identical 5-basis-point fees for both pairs.
Add assertions covering bounded economic price, reciprocal sorting, different pair fees, and repeated ERC20 allowance consumption.
Focused ESLint initially failed because `wrapped` was imported but unused in `scripts/verify-managed-lifecycle.ts`.

## Component boundaries

The initial lifecycle index mixed funding, conversion, registration, routing, and final simulation validation in one function of roughly 300 lines.
The owner has since extracted funding and conversion, reducing the index to 191 lines at the next inspection checkpoint.
The compiler, integer arithmetic, inventory accounting, route decoding, snapshot reader, and call encoding otherwise have distinct responsibilities.
Final maintainability acceptance remains subject to the completed fixes.

## Evidence collected

`npx tsx --test test/lifecycle.test.ts` initially passed all 10 tests.
The focused ESLint command covered both compiler files, all lifecycle files, lifecycle tests and fixtures, and both fork verification scripts.
It failed on the unused import described above.
The existing fork verifier passed independently on isolated Anvil port 19483.
The verifier ran from a temporary working directory, so its generated report did not overwrite the shared workspace's verification artifact.
It proved native funding, shared WETH inventory, fills in both directions, rollback after a failing final replacement call, successful replacement, exact program deadline behavior, close-only simulation during a route outage, and close-and-convert with paired balances read back as zero.
That run used the existing full-range scenarios and does not establish the missing bounded-price or repeated ERC20-purchase properties.
WETH, Aqua, and SwapVM were forked deployments; paired token code, resolver credentials, and the conversion router were local fixtures.
No real-chain transaction was sent.

## Accounting and execution boundaries

The planner counts each real token once and uses the maximum competing virtual claim as its backing requirement.
Funding credits minimum receipts rather than expected receipts, and the gas check reserves native value plus estimated execution cost.
Retirements precede purchases and registrations in one atomic batch.
Close-only planning does not request a swap route.
Conversion operates on explicitly selected amounts and refuses amounts above selected inventory, rather than summing virtual allocations.
The low-level planner receives the selected scope from its caller and does not independently establish managed-group ownership or resolve ambiguous transfer attribution.
Fresh snapshot and whole-batch simulation checks bind calls and record configuration, policy, and snapshot digests.
Submission-time configuration, lease, authorization, and expiry enforcement belongs to the execution layer and is outside this review's acceptance claim.
Residual reporting must remain scoped to the balances actually observed and must not treat missing observations as zero.
