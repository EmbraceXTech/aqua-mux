# Token proxy binding and receipt proof

A controlled Ethereum fork reproduced a mined transaction being incorrectly confirmed after its USDC implementation runtime changed between final preflight and inclusion.
The old code captured only EIP-1967 proxy pointers, while Circle FiatTokenProxy uses the legacy ZeppelinOS implementation slot.
Receipt dependency checks also covered only direct batch targets, leaving observed inner-call dependencies outside that check.

## Correction

`proxy-implementation.ts` centralizes EIP-1967 and the recognized legacy ZeppelinOS pointer conventions.
The legacy slot is defined by [Circle's official UpgradeabilityProxy source](https://github.com/circlefin/stablecoin-evm/blob/master/contracts/upgradeability/UpgradeabilityProxy.sol).
Malformed or conflicting pointer values are refused.
Lifecycle snapshots capture the current implementation address and its runtime hash, and signer asset checks re-read both recognized slots.
A previously stored plan lacking the now-recognized implementation binding is refused and must be refreshed.
The existing plan schema remains unchanged.
Receipt proof verifies direct targets and every recorded dependency whose code appears in the transaction prestate, including an indirectly called token proxy and its implementation.
A mined execution with changed dependency provenance stays unknown and retains the execution lock for owner recovery.
It is never made safe to retry merely because the receipt reports success.

## End-to-end evidence

All verification ran through Orca CLI on disposable forks with synthetic accounts.
No public transaction or unit test was run.
The before-change probe changed only trailing implementation runtime bytes after final preflight and obtained a successful receipt that the service incorrectly marked confirmed.
The same after-change probe obtained a successful receipt that production reconciliation kept unknown.
The indirect probe first set the exact reviewed Aqua allowance on the fork, verified the USDC proxy was absent from direct batch targets, and still refused the changed implementation proof.
An attempted new execution lock after that unknown result was refused.
A separate probe changed the legacy proxy pointer to another address with identical implementation code before signing; it was refused with zero transaction journal entries.
The retained before/after and pointer evidence is `proxy-binding-adversarial-evidence.json`.

The complete Ethereum, Arbitrum native-USDC, Arbitrum bridged-USDC, BNB and Robinhood lifecycle scenarios all passed after the correction.
Those five scenarios retain two-pair registration, both fill directions, replacement rollback, conversion residuals, receipt reconciliation and ambiguous relay recovery.
Their separate retained evidence is `proxy-binding-lifecycle-forks.json`.
Formatting, type checking and focused lint passed.

Reproduce the post-inclusion direct probe with `npx tsx scripts/verify-external-adapter.ts --ethereum --proxy-upgrade --expect-unverified`.
Add `--indirect` to verify an inner-call token dependency and the unresolved retry lock.
Use `--proxy-pointer-before-signing` instead of `--expect-unverified` for the pointer-change refusal before journaling.
The adversarial implementation is isolated in `scripts/fixtures/proxy-upgrade.ts`.
The normal full lifecycle invocations retain their previous behavior.

## Boundary

These checks bind the two recognized storage-slot proxy conventions and observed deployment code.
They do not claim general verification of arbitrary upgrade mechanisms or token economic guarantees.
Unknown route programs and Robinhood dependencies without authoritative provenance remain refused.
