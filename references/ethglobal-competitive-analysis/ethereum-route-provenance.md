# Ethereum transparent route provenance

Ethereum native or wrapped ETH can now exchange with USDC and USDT through two pinned Uniswap v3 pools and locally compiled 1inch transparent calls.
The authenticated public plan endpoint previously refused Ethereum because no verified router deployment was enabled.
The same Orca embedded browser fixture now returns an executable two-output plan whose whole batch passes `eth_call` on an Ethereum fork.
This establishes bounded route support, not support for every asset listed by the dynamic registry.

## Source and deployed code

The retained evidence is in `apps/frontend/lib/server/route-policy/fixtures/ethereum/attestation.json`.
Router source was retrieved from [the Ethereum verified contract record](https://eth.blockscout.com/api/v2/smart-contracts/0x111111125421ca6dc452d289314280a0f8842a65).
Solidity 0.8.23 with the recorded optimizer, IR, and Shanghai settings reproduces the router runtime exactly after independent EIP-712 domain and WETH immutable binding.
The explorer's constructor arguments refer to a verified twin and were not trusted as deployed immutable values.
The quoter and both pools reproduce the previously retained Solidity 0.7.6 source templates, including metadata, after independent factory, token, fee, tick-spacing, maximum-liquidity, and self-address binding.
The [official Uniswap deployment documentation](https://developers.uniswap.org/docs/protocols/v3/deployments) supplies the deployment context; addresses alone are not treated as provenance.
WETH source from [its verified contract record](https://eth.blockscout.com/api/v2/smart-contracts/0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2) compiles with Solidity 0.4.19 to identical executable bytes with differing trailing metadata.
The complete observed WETH runtime hash is pinned, including that metadata.
No runtime byte difference was masked outside compiler-declared immutables or the explicitly compared metadata trailer.

## Reproduction

From `apps/frontend`, replay the four compiler templates with `node lib/server/route-policy/fixtures/provenance/recompile.mjs /tmp/aquamux-route-policy lib/server/route-policy/fixtures/ethereum/attestation.json`.
The compiler cache must contain the exact compiler files whose URLs and SHA-256 digests are retained in the manifest.
Run `npx tsx scripts/verify-ethereum-provenance.ts` to reconstruct the semantic immutable values and compare all five runtime hashes with current read-only Ethereum RPC results.
All four compiler replays and five source/runtime attestations passed.
Run `npx tsx scripts/verify-public-route-http.ts 1` in an Orca terminal and open its printed loopback URL in the Orca embedded browser.
Clicking the audit button calls the production authenticated public plan handler and simulates the returned batch on the local fork.
The browser result binds both receivers to the synthetic owner, spends exactly 50000000000000 wei per leg, and displays the encoded minimum receipts of 125001 USDC units and 125022 USDT units.
The durable before/after browser result is `ethereum-route-browser-evidence.json`.
Type checking passed.
No unit tests were added or run, and no public transactions were sent.

## Scope

The manifest enables only the two documented pools and their reverse directions.
It does not authorize arbitrary 1inch executor programs or other pools.
Ethereum managed account capability remains separately gated pending full lifecycle execution evidence.
Robinhood aggregation-router and unverified-token boundaries are unchanged.
