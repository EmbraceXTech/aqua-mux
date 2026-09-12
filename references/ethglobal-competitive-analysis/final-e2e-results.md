# Managed LP integrated E2E evidence

This report records read-only preflight on September 12, 2026, Asia/Bangkok.
The designated execution worker has submitted the bounded funding transfers on all three chains recorded below.
No managed LP transaction has been submitted.
The complete managed LP workflow remains pending the coordinator's signing, lifecycle and route-policy acceptance gate.

## Ownership and evidence

This worker owns only the new `apps/frontend/scripts/managed-e2e-*.ts` verification scripts and `references/ethglobal-competitive-analysis/final-e2e-*` evidence.
Feature fixes belong to their assigned implementation workers.
All existing dirty work is preserved.
The three preflight scripts separate pinned historical inventory, quote feasibility and funding estimates.
They derive public addresses where needed and never construct a signing client.
The separate transfer script implements only the coordinator's bounded native funding gate.
It fixes the source and destination, checks fresh balances and settled nonces, records a public transaction hash before broadcast, and refuses to rerun an existing journal.
All scripts suppress provider errors that could contain credentials.

The baseline includes its source revision and dirty file list.
The quote run recorded source revision `64bc2ae26f0d98c0aec410fcd8c7f6c550ff818b` in the shared working tree.
That revision was sampled when the run finished and does not freeze concurrent file edits during requests.
Independent code-quality review is required before integration acceptance.

## Original wallet baseline

The original maker is `0xA9aA0Af420578223B11FF5430d428055C52e8C89`.
[The pinned baseline](final-e2e-baseline.json) records exact raw balances, allowances to Aqua, SwapVM and the chain-specific classic router, historical strategy allocations, contract code hashes, block hashes and nonces.
Its asset coverage is the tokens named by the prior live-execution evidence, not a complete wallet census.
No absence of other assets or registrations is inferred from that scope.

| Chain | Pinned block | Native balance | Historical registrations | Mined and pending nonce |
| --- | --- | --- | --- | --- |
| Arbitrum 42161 | 504164402 | 0.00947159091446 ETH | 2 | 8 |
| BNB 56 | 121325738 | 0.00921764005 BNB | 2 | 5 |
| Robinhood 4663 | 60538313 | 0.009540597869896 ETH | 2 | 6 |

All six historical strategies still return two-token registrations.
That fact does not establish executable backing or resolver discovery.
Arbitrum's historical WBTC allocation is 311 raw units while the observed wallet balance is 14 and Aqua allowance is 5.
Arbitrum account code is `0xef010063c0c19a282a1b52b07dd5a65b58948a07dae32b`.
It differs from the development signer's approved implementation, so this worker will not replace or clear that delegation.
BNB and Robinhood account code is empty at their pinned blocks.

The coordinator directed an isolated new execution wallet to avoid changing historical registrations, allowances and shared backing.
The original wallet may only fund that wallet through separately gated plain native transfers.
Coordinator message `msg_21ac15722687` released the exact funding step below, while all managed transactions remain gated.
The executor passed independent review before the first transfer.

## Proposed isolated funding

The dedicated execution wallet is `0x992A6a939579e10Ad47C347a5be3788c94992Dd4`.
Its key is held only in the ignored `apps/frontend/verification/final-e2e-wallet.env` file with mode 600.
The original `.env` is unchanged.
The key must never enter the agent runner environment or browser.

[Funding preflight](final-e2e-funding-preflight.json) found zero native balance and no code for the new wallet on all three chains.
The candidate transfer is 0.0015 native units on each chain.
Each transfer must preserve at least 0.007 native units in the original wallet and must refuse a maximum transaction fee above 0.00001 native units.
Gas limits use the fresh RPC estimate with 20 percent padding, which allows estimation variation while retaining an explicit cap.
All amounts and fee estimates must be refreshed immediately before signing.

| Chain | Maximum fee at preflight, wei | Selected managed budget | Managed native recovery reserve |
| --- | --- | --- | --- |
| Arbitrum | 613991198400 | 0.0002 ETH | 0.0005 ETH |
| BNB | 1260000000000 | 0.0005 BNB | 0.0005 BNB |
| Robinhood | 3425647680000 | 0.0002 ETH | 0.0005 ETH |

The funding amounts leave room for opening, replacement and exit transactions beyond the selected inventory budget.
They are a proposed bounded test allocation, not an estimate of investment returns or required production capital.

## Entry route feasibility

[Read-only route evidence](final-e2e-routes.json) records six accepted entry quotes from the lifecycle route validator loaded by that historical run.
The candidates are native ETH to USDC and WBTC on Arbitrum, native BNB to USDC and ETH on BNB, and native ETH to USDG and PONS on Robinhood.
Per-leg input is 0.00005 ETH or 0.000125 BNB, leaving half of the proposed managed budget for shared wrapped-native backing.
Each quote used a 100 basis point slippage limit and returned a positive minimum output.
All six used selector `0x07ed2379` and the configured chain-specific classic router.
Quotes used the original maker before the isolation decision and must be regenerated for the new wallet.
Outer route validation does not establish nested executor safety, signer acceptance, whole-batch simulation, reverse conversion availability or future route availability.
All recorded quotes have expired and cannot authorize execution.

## Browser checkpoint and remaining proof

The UI worker granted this worker read-only ownership of Orca page `c95d3318-bbd2-4be3-90d6-fad9f99dd580` on port 33127.
The observed page showed the original development maker, an existing draft and the fresh proposal form.
No proposal, existing draft or wallet state was changed at this checkpoint.
The new wallet needs a separate loopback server process with the generated key loaded only into that server, without disrupting the UI worker's ongoing tests.

After the acceptance gate, the proof must cover native-only two-pair proposal, confirmed opening, in-app discovery and backing, replacement, stop, review history, reload recovery, close-only during a route outage, close-and-convert and exact residual readback.
Real fills require observed transaction evidence and attributable events.
If resolver credentials are unavailable, the already documented credential-fixtured fork proof remains explicitly separate from mainnet registration and cannot be described as a live fill.
Each supported mainnet still needs its own receipts and explorer links.
No mainnet lifecycle acceptance claim is made in this preflight report.

## Checks completed

The pinned baseline script completed on all three mainnets without transaction submission.
The quote script completed all six route requests without transaction submission.
The funding script completed all three read-only funding estimates.
Scoped ESLint passed for all three scripts.
Frontend TypeScript passed after all three scripts were added.
The original preflight scripts and corrected funding executor passed independent review.
The funding executor passed scoped ESLint.
A later full TypeScript run found unrelated concurrent test errors in `legacy-token-integration.test.ts` and `route-policy.test.ts`, which were routed to their owners.

## Resumed funding checkpoint

Dispatch `ctx_780ad367be39` resumed sole transaction ownership on September 12, 2026.
Coordinator messages `msg_2433dfbc364f` and `msg_293e0690ba71` carried the original funding-only authorization forward.
[The refreshed baseline](final-e2e-baseline-refresh.json) found unchanged original maker balances, account code, token allowances and tracked registrations before funding.
[The refreshed funding estimate](final-e2e-funding-refresh.json) found the isolated wallet unfunded on all three chains.

The exact reviewed executor SHA-256 was `f5c6a05ecc99dcad61462cac8637d20c1f974717a1831cfa95a9f0ea4fcb6076`.
[The immutable first funding journal](final-e2e-funding-execution.json) records one successful Arbitrum transfer of 0.0015 ETH.
Its transaction is [0x1b1aaf05d8825eaa821b731b94639009d061dbea2a84b4fc6d71e676c28a3347](https://arbiscan.io/tx/0x1b1aaf05d8825eaa821b731b94639009d061dbea2a84b4fc6d71e676c28a3347).
The receipt block is 504193867 and the actual fee is 423904764000 wei.
The source retained 7971167009696000 wei and its original delegation code.
The destination held exactly 1500000000000000 wei at that block.
Independent reviewer dispatch `ctx_14f240ca5e0b` confirmed the transaction envelope, receipt-block balances, all tracked allowances and strategy allocations, and unchanged contract hashes in message `msg_b1a9285d9389`.

The executor then stopped before creating a BNB attempt in its journal.
Its fixed error handler did not record the failed operation, so the exact cause remains unknown.
Fresh read-only BNB and Robinhood checks found zero destination native balances, no destination code, and unchanged settled source nonces 5 and 6.
No BNB or Robinhood submission is recorded at this checkpoint.
[The later original-wallet snapshot](final-e2e-after-arbitrum-funding.json) preserves the tracked state after Arbitrum funding.

Commit `cb0551a` adds a separate read-only recovery helper and an explicit remaining-chain funding mode.
The helper verifies the exact Arbitrum transaction hash, sender, receiver, value, calldata, nonce, absence of authorizations, successful receipt and canonical receipt block.
It requires the original BNB and Robinhood source nonces to remain settled and the destinations to remain unfunded with zero pending nonce.
The executor preserves the original journal, creates a new exclusive journal bound to its SHA-256, and permits only chains 56 and 4663 in this recovery mode.
Existing fee and reserve limits still apply before signing and submission.
Scoped ESLint and the live read-only recovery check passed.
Full frontend TypeScript failed during a concurrent token-resolver refactor, with errors routed to its owner.
Independent reviewer dispatch `ctx_14f240ca5e0b` accepted the recovery correction in message `msg_fac8d49a76ae` after scoped lint and nine dependency-fixtured reconciliation cases.

[The remaining-chain journal](final-e2e-funding-remaining.json) records successful BNB and Robinhood funding after that acceptance.
The BNB transaction is [0x19abd51c15d8d38c05cdf00d680e53ad2567a3769d544de69d0999d6eee56e9c](https://bscscan.com/tx/0x19abd51c15d8d38c05cdf00d680e53ad2567a3769d544de69d0999d6eee56e9c).
The Robinhood transaction hash is `0x1a4a475178317a49b5985b1b0e73f43865d479419a422c41de542aaadf5e05ab`; its explorer URL is retained in the journal.
Both receipt-block destination balances are exactly 1500000000000000 wei.
The BNB source retained 7716590050000000 wei and the Robinhood source retained 8038402025896000 wei.
[The post-funding snapshot](final-e2e-after-funding.json) records the tracked original-wallet state on all three chains.
The remaining-chain receipt evidence awaits independent review.

## Current browser blockers

An actual Orca snapshot on port 33127 reproduced `resolveToken is not a function` in the legacy Swap builder during the token-resolver refactor.
The observation was routed to its implementation owner.
After disconnecting the previous original-maker session, clicking `Use local development wallet` returned `Local development wallet is disabled.`
The server owner received that reproduction and owns the launcher correction.
The server owner then corrected the explicit development-wallet opt-in and verified connection to the isolated maker.
The next browser attempt reproduced a separate `wallet.session` TypeError at `managed-workspace.tsx:24` when clicking Strategies after a fresh reload.
The UI owner received that repeatable failure before any feature fix by this worker.
No new proposal or managed signing action was submitted during these observations.
