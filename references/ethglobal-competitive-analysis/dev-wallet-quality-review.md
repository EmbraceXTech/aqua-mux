# Development wallet quality and security review

Review date: September 12, 2026.
Review dispatch: `ctx_0332acce0a00`.
Implementation owner: `ctx_3e79898bdb19`.
This reviewer owns only this report and has not edited implementation files.

## Verdict

Changes required.
The implementation is still changing, and the owner has not supplied a final commit for acceptance.
The initial inspection used the shared working tree over `669d253642cf0ae247a68eaaf346472337fbe6c2`; that commit alone does not contain the inspected uncommitted development wallet implementation.
Do not interpret passing tests below as acceptance of a final revision.

## Findings

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
No `wallet.ts` development wallet integration was present during the initial inspection.
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

## Acceptance still required

The coordinator must route the findings to their implementation owners and supply exact final commit identifiers.
Re-run adversarial planning, fresh-reserve, pre-send refusal recovery, and normal test discovery checks after the fixes.
Review the final diff for unrelated changes and verify the browser smoke evidence against the same implementation revision.
Browser ownership remains with the implementation owner; this reviewer has not interacted with the shared browser or sent live transactions.
