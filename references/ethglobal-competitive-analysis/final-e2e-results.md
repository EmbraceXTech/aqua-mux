# Managed LP integrated E2E evidence

This report records read-only preflight on September 12, 2026, Asia/Bangkok.
No transaction has been signed or submitted by this worker.
The complete managed LP workflow remains pending the coordinator's signing, lifecycle and route-policy acceptance gate.

## Ownership and evidence

This worker owns only the new `apps/frontend/scripts/managed-e2e-*.ts` verification scripts and `references/ethglobal-competitive-analysis/final-e2e-*` evidence.
Feature fixes belong to their assigned implementation workers.
All existing dirty work is preserved.
Each script has one purpose: pinned historical wallet inventory, quote feasibility, or isolated-wallet funding preflight.
The scripts derive public addresses where needed and never construct a signing client.
They write new evidence files exclusively and suppress provider errors that could contain credentials.

The baseline includes its source revision and dirty file list.
The quote run used source revision `9ce6fc2ee48fc83a09cb0af4a47d8516bdda36cd` in the shared working tree.
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

[Read-only route evidence](final-e2e-routes.json) records six accepted entry quotes from the current lifecycle route validator.
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
The scripts and this report still await independent review.
