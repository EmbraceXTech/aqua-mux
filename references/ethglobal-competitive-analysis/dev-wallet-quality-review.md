# Development wallet quality and security review

Review date: September 12, 2026.
Review dispatch: `ctx_0332acce0a00`.
Implementation owner: `ctx_3e79898bdb19`.
This reviewer owns only this report and has not edited implementation files.

## Verdict

Accepted for the restricted signer foundation at exact final commit `4dac1a6d8e255cc2120c2e6195596647d23e0ec0`.
This includes the foundation implementation in `98eed703b6bd644d58399291a8673d2e9b66ebdb` and the final reconciliation-status correction.
The accepted behavior excludes local-signer swap execution because the nested executor policy remains unverified.
This is not acceptance of complete swap support, delegated automation, or live transaction compatibility.
The original findings below describe the earlier working tree and are retained with their resolution evidence.

## Findings

All four findings are corrected or contained in the restricted foundation commit.
The first finding is contained by refusing local swap execution; broader route support belongs to a separate implementation and review.

### P1: basket review does not bind upstream swap calldata to user intent

`lib/server/plan.ts` copies `quoteBasket` transaction calldata while constructing the displayed minimum receipts from the provider's descriptive JSON.
`lib/server/swap.ts` verifies the outer router and sender, but does not decode and bind source, destination, input amount, and encoded minimum to the request.
`lib/server/dev-wallet/policy.ts` accepts any catalog source and destination, positive amount, and positive minimum.
It also ignores the swap executor, source receiver, and nested executor payload.

A synthetic test invoked the real `DevBasketService.prepare` and `buildPlan` with mocked RPC and quote responses.
The user input was a 1 WBNB basket split equally into USDT and USDC.
The accepted review displayed `Pay 1 WBNB`, `Receive at least 99 USDT`, and `Receive at least 99 USDC`.
Both encoded calls actually spent 9 WBNB, selected USDT as their output, and enforced a minimum receipt of one base unit.
The fixture supplied a non-approved executor and source receiver plus `0xdeadbeef` as its nested payload.
The mocked wallet had sufficient balance and existing router allowance, so the compiler emitted both harmful calls without an approval adjustment.
No signing or broadcasting occurred.

The temporary reproduction script is `/tmp/aquamux-dev-wallet-review-adversarial.mts`.
Run it from `apps/frontend` with `AQUAMUX_DEV_WALLET_MAX_FEE_WEI=1000000000000000 npx tsx /tmp/aquamux-dev-wallet-review-adversarial.mts`.
This script uses public fixture addresses and intercepts all network requests.
The owner must validate the actual calldata against the requested leg and reviewed minimum, reject unverifiable nested execution, and add a regression through the planning entry point.
Managed lifecycle routes already bind the descriptive assets, amount, and minimum, but their executor and opaque payload trust boundary also needs an explicit reviewed decision.

### P2: managed recovery reserve is dropped before signing

The lifecycle compiler includes `gasReserveWei` in the canonical plan and checks it against the planning snapshot.
`lib/server/dev-wallet/batch.ts` drops this field in `lifecycleBatch`.
`lib/server/dev-wallet/signer.ts` checks fresh native balance only against call value and maximum transaction fee.
A balance or fee change after planning can therefore consume the separately reviewed recovery reserve while passing the signer check.
Carry the canonical reserve into the signing boundary and recheck it using the fresh balance and final fee bound.
Add a synthetic RPC test where transaction costs fit but the remaining balance falls below the required reserve.

### P2: definitely unsent journaled attempts can block owner recovery indefinitely

Both basket and managed execution persist the signed hash and hold the shared execution lock before calling the broadcast closure.
The closure rechecks session and plan validity before it calls the RPC.
If that check fails, the catch path treats the attempt as an ambiguous broadcast even though the RPC was never called.
An absent receipt cannot settle that hash, and the unresolved lock prevents later owner close actions.
Preserve conservative handling when a send may have occurred, but distinguish a proven pre-send refusal and document crash recovery for a signed hash that never reached the network.
Never release a truly ambiguous lock merely because a receipt is missing.
The independent `/tmp/aquamux-dev-wallet-review-recovery.mts` fixture reproduced this through `DevBasketService.execute` and `status` with a revoked guard before the injected network side effect.
It observed zero broadcasts, an unknown outcome, and refusal of a subsequent owner-close lock.

### P2: standard tests omit the signer security suite

The current `package.json` test command is `tsx --test test/*.test.ts`.
It excludes every test under `lib/server/dev-wallet`.
Include these tests in the normal test entry point so signing, authentication, and recovery regressions run in routine verification.

## Ownership and maintainability

The implementation separates request validation, session authentication, basket persistence, managed execution adaptation, calldata checks, batch encoding, RPC signing, and read-only simulation into focused modules.
The largest inspected production module in this directory was 219 lines.
The route handler is a small adapter, and the client module exposes plan, confirm, status, and disconnect operations without raw signing methods.
The final `wallet.ts` change adds conservative normalization of wallet batch outcomes.
Managed client integration uses the separate development wallet adapter.

Private-key access is limited to the server configuration module and explicit existing live scripts.
The inspected client adapter contains no secret environment access.
There is no explicit `server-only` import guard in the configuration or signer module, so this boundary currently depends on import discipline.
The read-only simulator appropriately shares batch encoding without calling the development account signer.

## Verified behavior

The dedicated suite passed seven tests on the initial inspection.
It covers development opt-in, production refusal, exact browser origin and host checks, proxy and cross-site refusal, authenticated session ownership, disconnect revocation, strict execution request fields, maker and expiry checks, unexpected approval spenders, direct transfers, chain mismatch, implementation bytecode mismatch, unknown account delegation, fee refusal, self-authorization nonce, and durable unknown-broadcast locking.
The signer test uses a local synthetic RPC and a public deterministic fixture key.
It does not send a live transaction.

The expanded focused command passed 28 tests:

```sh
npx tsx --test test/wallet.test.ts test/managed-execution.test.ts test/lifecycle.test.ts test/managed-auth-http.test.ts test/automation-lease.test.ts lib/server/dev-wallet/*.test.ts
```

Those tests also cover atomic wallet requirements, expiry and account changes, route-independent close, lifecycle receiver and minimum validation, generation fencing after Stop, and browser lease ownership.
Focused ESLint passed with `npx eslint lib/server/dev-wallet lib/dev-wallet.ts 'app/api/dev-wallet/**' --max-warnings=0`.
The observed Node SQLite experimental warning was informational.

## Correction verification

`validateDevPlan` now refuses every classic-router call until a verified nested executor policy exists.
The independent synthetic basket reproduction now fails with the explicit executor-policy refusal before producing an executable review.
The read-only simulator uses the separate `validateBatchEnvelope`, so this local signing restriction does not disable external-wallet lifecycle simulation.

`lifecycleBatch` now carries `gasReserveWei` into the signer.
The signer preserves that reserve against a fresh native balance and final maximum fee before signing and before broadcast.
The fixture test rejects reserve insufficiency and a balance drop after signing, with zero journal writes in the latter case.

The broadcast closure runs final guards before a synchronous journal callback immediately preceding the RPC send.
The independent recovery reproduction now observes zero broadcasts, no stored transaction hash, and an available owner-close lock after a pre-send refusal.
The existing restart test still preserves the lock and known hash after an ambiguous network result until a confirmed receipt allows release.

The default test command now includes `lib/server/dev-wallet/*.test.ts`.
The reviewer ran the complete default suite and observed 99 passing tests, one skipped optional test, and zero failures.
The final focused signer suite passed eight tests after the foundation commit.
The same eight tests passed again against final commit `4dac1a6d8e255cc2120c2e6195596647d23e0ec0`.
The final correction returns unknown when RPC configuration or managed reconciliation is unavailable, without treating the missing observation as permission to retry.
An independent missing-RPC-configuration check confirmed the unknown result.
Five independent normalization cases passed for pending, confirmed, reverted, missing-receipt, and non-atomic outcomes.
Focused ESLint passed.
`npx tsc --noEmit --incremental false` passed after the authentication-test owner corrected an unrelated header typing error.

## Evidence limits and remaining integration work

The implementation owner's [results record](dev-wallet-results.md) reports an Orca browser reproduction of the Next URL-alias issue and successful HTTP connect and disconnect against the running Next server after its correction.
The owner reports 200 responses for both operations without printing bearer tokens or signing material.
This reviewer verified synthetic authentication and signing tests but did not independently operate the shared browser.
Neither the implementation owner nor this reviewer submitted a live transaction in this task.

Close-only and already-funded LP plans remain available through the restricted local signer.
Swap funding and close-and-convert plans requiring aggregator calls remain unsupported by that signer until separately reviewed route authority exists.
Any later policy-worker changes require a fresh review against their exact commit.
External-wallet compatibility and complete browser lifecycle acceptance remain separate integration gates.

A process crash after durable journaling but before the network send cannot prove whether the transaction escaped.
Such an attempt remains locked for positive reconciliation; missing receipts never authorize automatic rebroadcast or lock release.
This is a conservative recovery limitation, distinct from the corrected known pre-send refusal.

The reviewed development wallet, client adapter, wallet normalization, route handler, and package test command matched the final commit at verification time.
Only this report was edited and committed by the reviewer.
