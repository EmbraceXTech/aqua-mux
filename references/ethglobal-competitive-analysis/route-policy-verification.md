# Verified transparent route policy

Recorded September 12, 2026 in Bangkok time.
No transaction was broadcast to a public network.
Independent review and adapter integration remain required before accepting the funded user workflow.

## Ownership and integration

The consolidated chain-execution worker owns the route policy, local signer, external adapter, lifecycle compiler integration and their retained execution evidence.
The app worker owns HTTP and browser integration, managed product state and proposal controls.

`quoteVerifiedRoute(request)` returns a serializable `VerifiedRoute` with its original request, exact call, spender, expected output, enforced minimum, expiry, and pinned pool identifier.
Requests contain chain ID, maker, source and destination addresses, input amount, minimum output floor, and slippage basis points.
`validateCompiledRoute(independentCanonicalRequest, route)` requires the request compiled from the reviewed plan.
Passing `route.request` alone does not establish that the route belongs to the plan.
Every router call must match exactly one persisted route record, and batch token approvals and minimum receipts must be checked against those records by the signer.
`verifyRouteProvenance(route)` rereads the RPC chain and deployed router and pool code, comparing their complete runtime hashes to the manifest.
Call it again immediately before signing or broadcasting.
The enclosing batch still requires whole-batch simulation and signer policy checks.

## Policy

Policy version 1 supports locally constructed `unoswapTo` and `ethUnoswapTo` calls over one pinned pool.
Policy version 2 adds the Robinhood direct-pool program described below.
The compiler constructs every flag and address bit, and the validator compares the entire calldata to this canonical encoding.
Receiver, source token, input amount, native value, pool address, pool direction, destination token, output minimum, and spender are bound to the request and manifest.
The destination follows the verified pool's immutable tokens and the explicit native unwrap flag.
ERC20 routes have zero native value.
Native input uses the exact reviewed value and the router's known wrapped token.

Generic aggregation `swap`, arbitrary executors, permits, Permit2, unknown flags, extra pools, arbitrary calls, transfers, ownership changes, and trailing calldata are rejected.
Routes expire after at most 30 seconds and support slippage from 0 through 500 basis points.
Amounts are bounded below 2 raised to 112 to keep supported pool arithmetic within its known domain.
Pairs absent from the manifest are unavailable, including unsupported combinations of otherwise familiar tokens.
The quote uses the pinned pool's on-chain quoter or reserves, rather than forwarding or rewriting an API executor program.
It may provide a worse price or less coverage than the general aggregator.

## Research and baseline reproduction

Running `node --import tsx /tmp/aquamux-dev-wallet-review-adversarial.mts` through `DevBasketService.prepare` raised the existing local-wallet executor-policy rejection before these changes.
The fixture misbinds the displayed spend and minimum and inserts an unapproved executor and `0xdeadbeef` program.
The refusal must remain effective after adapter integration.

Authenticated 1inch liquidity source, spender, and swap requests succeeded on BNB, Arbitrum, and Robinhood without logging the configured credential.
Restricted single-pool requests still returned `swap` selector `0x07ed2379`, executor `0x111116053f09d34a7eae8102887004445176ca11`, and opaque programs.
Those responses are research evidence only and are never executable inputs to this policy.

[Official 1inch API documentation](https://business.1inch.com/portal/documentation/apis/swap/classic-swap/methods/v6.1/1/swap/method/get) describes protocol restrictions, receiver, slippage or minimum return, partial fills, and Permit2 controls.
Request parameters alone do not establish executor safety.
[Verified Arbitrum router source](https://arbitrum.blockscout.com/api/v2/smart-contracts/0x111111125421ca6dc452d289314280a0f8842a65) was fetched and inspected, including `ProtocolLib` and `UnoswapRouter`.
The source was compiled with Solidity 0.8.23 and its published optimizer and IR settings, and matched the RPC runtime outside compiler-reported immutable fields and Solidity metadata.
The enabled deployment is additionally pinned by its complete runtime hash, including those fields.

## Current evidence

| Chain | Runtime provenance | Execution evidence | Availability |
| --- | --- | --- | --- |
| Arbitrum 42161 | Verified source, recompiled router match, pinned pool runtime | Two live RPC `eth_call` simulations with synthetic caller balance | ETH/WETH to or from USDC and USDT |
| BNB 56 | Recompiled router, pools, quoter and WBNB with semantic immutable checks | Two live RPC eth_call simulations with synthetic caller balance | BNB/WBNB to or from USDC and USDT |
| Robinhood 4663 | Eight direct-pool dependencies recompiled with pinned code, proxy and token bindings | Controlled-provider native-funded two-pair entry and close-convert on a real-code fork | WETH/USDG and WETH/PONS direct pools; aggregation router disabled |

Arbitrum's router runtime hash is `0xaae25d52ea3e7bbb8cc826b589060f063c7f6ca2c2da88bc9b3b0e0a57bd8fb6`.
Pool addresses, runtime hashes, and verified source endpoints are in `deployments.ts`.
Blockscout labels the pool sources verified with partial rather than full metadata matching; their complete deployed bytecode matches the RPC hashes.
Neither pool has a proxy implementation listed by the explorer.

The retained Arbitrum fixtures use `100000000000000` wei of native ETH and a synthetic caller.
The USDC call returned 253430 base units against minimum 250895.
The USDT call returned 253474 base units against minimum 250939.
Each simulation output matched the on-chain quoter output.
Fixtures retain full calldata, block number, minimum, and zero public broadcasts.
They do not prove a complete funded LP entry, registration, or close-and-convert batch.

BNB's router runtime hash is `0x7b9ea7c1da2784fe89f77fb8dba143f593a5ebf5afe45d0970d57007a98233af`.
Its executable runtime matches Arbitrum after replacing WETH with WBNB and the Uniswap V3 factory with `0xdb1d10011ad0ff90774d0c6bb92e5c5c8b4461f7`, and accounting for compiler immutable locations and metadata.
Immutable differences are the expected chain/domain separator and wrapped-token values; router address, name, and version fields match.
This does not by itself approve a BNB pool.

Robinhood's router runtime hash is `0x2d953ea912513133437636b2f9c6854cbe418d038f82107ae432a5459c54a8a0`.
Its different executable length and compiler version prevent authorization through the Arbitrum comparison.
Metadata identifies Solidity 0.8.30 and IPFS CID `QmVfpDJGXVDvrWaZ1wiFsuURVKALJEcsDksEF3h2AhFy69`.
Robinhood Blockscout returned HTTP 403 and its PRO endpoint returned HTTP 402 without a key.
IPFS gateways returned HTTP 429 or could not resolve.
No exemption was added.

## Validation and remaining work

The initial `npx tsx --test test/route-policy.test.ts` checkpoint passed five tests using real calldata and deployed runtime fixtures.
Tests reject manipulated amount, minimum, receiver, spender, value, source/destination metadata, unknown pool/program/flags, trailing second-call bytes, stale routes, wrong RPC chain, and changed or absent deployment code.
TypeScript, focused ESLint, and focused Prettier checks pass.
The signer must separately demonstrate harmful second batch-call refusal and complete minimum receipt accounting.

BNB pool source verification and native-input read-only route proofs are complete.
The Robinhood milestone below supplies the required source provenance for direct-pool execution.
Obtain independent code-quality and security review, address required refactors, and verify signer/lifecycle adapters.
The later direct-pool milestone below adds controlled-provider funded entry and conversion evidence on all three chains; public-wallet browser integration remains a separate acceptance gate.

## Resumed source attestation and expiry corrections

The route policy now revalidates expiry after all provenance RPC awaits.
A regression test reproduced acceptance of an expired route before the fix and rejects it afterward.
Arbitrum WETH is an upgradeable proxy, so provenance checks its EIP-1967 implementation slot and the implementation runtime hash in addition to the proxy runtime.
Missing storage reads, changed implementations and changed implementation bytecode fail closed.
This is a pre-submission check, not an on-chain prohibition against a subsequent token administrator upgrade.

The durable evidence is in `apps/frontend/lib/server/route-policy/fixtures/provenance/`.
Seven retained standard JSON compiler inputs include their source content, compiler versions, exact settings, compiler download URLs and SHA-256 hashes.
`attestation.json` retains eleven complete deployed runtimes, pinned block numbers, compiler runtime templates, named immutable offsets and values.
The source replay script reproduces all seven runtime templates using pinned compiler binaries.
The offline provenance test independently derives router domain separators, chain IDs, wrapped token addresses, factory addresses, pool tokens, fee, tick spacing and liquidity bounds.
It compares every executable byte after those substitutions and verifies the complete deployed runtime hashes against the manifest.
BNB router metadata and Arbitrum WETH implementation metadata differ from their reconstructed source metadata; executable bytes match exactly.
No executable byte difference is ignored.

BNB source uses the verified Arbitrum router source with explicit WBNB and Uniswap V3 factory constants.
The resulting compiled executable matches BNB after the expected constructor immutable substitutions.
The BNB and Arbitrum quoters and all four pools match the retained Uniswap sources including metadata after immutable substitution.
WBNB source was recovered from the [Sourcify verified contract API](https://sourcify.dev/server/v2/contract/56/0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c?fields=all).
The [official Uniswap BNB deployment list](https://developers.uniswap.org/docs/protocols/v3/deployments/v3-bnb-deployments) independently identifies the factory, quoter and wrapped token.

`fixtures/bnb-calls.json` retains two native-input calls and outputs from read-only simulations with a synthetic caller balance.
The calls returned 72483725222404458 USDC base units and 72408738639154274 USDT base units against respective minima of 71758887970180413 and 71684651252762731.
These are historical quote observations, not current prices or funded lifecycle receipts.
Nine focused route tests, seven compiler replays and the frontend TypeScript check passed at this checkpoint.
Final independent review and full entry/close-convert fork execution remain integration gates.

## Robinhood direct-pool milestone

Robinhood no longer depends on recovering the unknown aggregation router to fund LP inventory.
The direct-pool policy supports WETH/USDG and WETH/PONS through verified Uniswap V2 pair code.
The existing registry identifies those assets; no USDC or USDT identity was invented for this chain.
This is executable route support, not an endorsement of an asset or a claim about token value.

Policy version 2 constructs an exact contiguous program inside the verified atomic account batch.
Native input first wraps the exact amount, then transfers that input to the pinned pool.
The pool swap specifies an exact output, the reviewed maker receiver and empty callback bytes.
An optional final unwrap uses only that exact wrapped-native output.
The source token transfer, pool address, output side, amount, receiver, native value and program length are bound to the canonical request.
No allowance is needed for the direct transfer.
The validator rejects an altered transfer, changed output, callback program, unknown pool or extra pool call.
The signer requires the complete sequence to occur once at its expected order in the reviewed batch.
Unmatched token transfers and extra pool/router calls remain forbidden.

Direct-pool quotes intentionally fix the output to the on-chain reserve quote rather than requesting the lower slippage floor.
This avoids donating the slippage allowance to pool liquidity providers.
An unfavorable price move causes the whole batch to revert.
The deterministic route limit rejects input above one percent of the source reserve.
This is a configured execution bound, not an estimate of liquidity quality.
The PONS pool has much less liquidity than the USDG pool, so a larger funding request may be unavailable.
The proved Robinhood run used 50000000000000 wei of native input for each purchase.

The manifest pins wrapped-native and USDG proxy shells, both implementations, PONS, the V2 factory and both pairs.
Provenance rereads their bytecode, proxy implementation slots, selected pair token and factory getters, and the current block relative to PONS's immutable launch restriction end.
PONS source has fixed supply and applies launch buy restrictions only before that immutable end block.
Those restrictions were already expired at the retained block.
USDG transfer source preserves exact base token balances and can reject paused or frozen accounts; the policy does not bypass those controls.

Eight standard JSON source inputs and pinned compiler hashes are retained under `lib/server/route-policy/direct/fixtures/`.
The replay script verifies source hashes, compiler binaries, runtime lengths, immutable substitutions and executable bytes.
The V2 factory source comes from the [official Uniswap repository](https://github.com/Uniswap/v2-core/blob/master/contracts/UniswapV2Factory.sol) combined with the retained verified pair source.
Its runtime matches after substituting only the explicit bzzr1 digest in the embedded pair creation metadata and the factory's final metadata.
Both substitution offsets require the expected CBOR digest prefix.
No executable instructions are excluded.
The remaining sources were recovered through Sourcify's verified contract API; exact URLs are retained per deployment in the attestation.

`external-adapter-fork.json` records successful native-funded two-pair entry and close-and-convert on Robinhood, Arbitrum and BNB through the production external signing adapter.
Robinhood close left zero WETH, USDG and PONS residuals.
The controlled-provider flow refused manipulated direct output, receiver, source amount, callback bytes and an extra pool call before broadcasting.
It also refused a signed transaction after plan expiry, recovered a deliberately lost RPC send response and proved whole-batch rollback after a failing nested call.
All receipts in this artifact belong to isolated forks, and public broadcasts remain zero.


## Arbitrum bridged USDC extension

The separately identified bridged USDC at `0xff970a61a04b1ca14834a43f5de4533ebddb5cc8` is now supported through the pinned WETH/USDC.e 500-fee pool at `0xc31e54c7a869b9fcbecc14363cf510d1c41fa443`.
It is not substituted for native USDC in token metadata or canonical requests.
The [verified pool source](https://arbitrum.blockscout.com/api/v2/smart-contracts/0xc31e54c7a869b9fcbecc14363cf510d1c41fa443) uses Solidity 0.7.6 and optimizer 800.
The complete deployed runtime, including metadata, exactly matches the already retained Uniswap pool compiler template after the independently read factory, token, fee, tick spacing, liquidity limit and pool-address immutable substitutions.
The new twelfth deployment attestation retains the full code, block number and semantic values without duplicating the unchanged source/compiler input.
The controlled-provider fork now includes a separate native-funded WETH/USDC.e and WETH/USDT entry and close-convert scenario, with zero USDC.e and USDT residuals.
The same local-signer, refusal, recovery and receipt-proof checks passed for this scenario.
Idle fork headers are advanced with a local mined block before snapshot reads; production staleness checks remain unchanged.


The final controlled-fork lifecycle now uses production receipt reconciliation and extends all four supported scenarios through credential-fixtured fills in both directions, failed replacement rollback, successful replacement and close-convert.
Runtime adapter and route policy reviews accepted commits through `e123941`; the subsequent E2E helper split and full lifecycle artifact receive a separate review.
See `execution-integration-results.md` for the fixture boundaries, exact ownership and remaining wallet/browser acceptance scope.
