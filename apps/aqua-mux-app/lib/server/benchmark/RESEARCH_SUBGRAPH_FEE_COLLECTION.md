# Public-subgraph fee collection research

Research date: 2026-08-29.

## Decision

The public DEX AMM standard does not define a position-level fee-collection entity or a position-level cumulative swap-fee field. It can provide comparable protocol and pool supply-side revenue, plus v3 position, position-snapshot, deposit, and withdrawal data. It cannot, by itself, support exact wallet fee collections.

Keep the benchmark's on-chain event replay as the source of truth for v3 collected fees. Treat public-subgraph fields as discovery, coverage, pricing, and provenance data. Do not allocate a pool's `cumulativeSupplySideRevenueUSD` to wallets by current liquidity or use `cumulativeWithdrawUSD - cumulativeDepositUSD` as fees.

## What the standardized schema provides

The Graph documents DEX AMM Extended as the standard for concentrated-liquidity AMMs. The standard defines protocol and pool `cumulativeSupplySideRevenueUSD`, `uncollectedSupplySide*` fields, `Position`, `PositionSnapshot`, `Deposit`, and `Withdraw`. Its `Position` and `PositionSnapshot` contain cumulative deposit and withdrawal amounts, liquidity, ownership, and block data. Neither entity contains collected swap-fee token amounts or USD. The standard has no `Collect` entity.[1][2]

This is useful data for the benchmark:

- Read `DexAmmProtocol` and `LiquidityPool` revenue and time-series fields for protocol and pool coverage only.
- Read every eligible v3 `Position`, its snapshots, deposits, and withdrawals at one pinned `_meta` block to discover and validate candidate histories.
- Read token prices with a time-travel query at the collection block if the source exposes a reliable price field.
- Persist each source's schema and methodology versions. They are part of the standard precisely because the metric definitions can change.[1]

It is not wallet fee data. Supply-side revenue is the swap-fee amount that accrues to LPs across a pool or protocol. It does not identify the LP, position, ownership interval, or whether a position collected the amount.

## Why v3 requires chain events

The v3 NonfungiblePositionManager emits `Collect(tokenId, recipient, amount0, amount1)`. It names the NFT and exact token amounts paid out. It also emits `DecreaseLiquidity`, whose amounts are principal accounted to the position. The contract says that the `Collect` amounts can differ from actual transfers because of rounding.[3]

The pool's `Collect` event does not carry the NFT token ID. It identifies the position with owner and tick range, and a position can be changed or transferred. The NFT-manager `Collect` event is the preferred join key for wallet benchmark accounting.[4]

The Messari Uniswap v3 fork mapping currently handles `IncreaseLiquidity`, `DecreaseLiquidity`, and `Transfer`. It does not import or handle `Collect`; its position entity stores deposits and withdrawals only. This confirms that the standardized public deployment cannot replace the benchmark's RPC log replay with a GraphQL query.[5][6]

The current replay method is therefore the right accounting model for *collected* v3 fees:

1. Resolve the NFT manager and token ID from the position's opening transaction.
2. Replay `Transfer`, `IncreaseLiquidity`, `DecreaseLiquidity`, and manager `Collect` logs through one fixed cutoff block.
3. Attribute each `Collect` amount to principal debt created by earlier decreases, then classify only the remainder as fees.
4. Reject or split ownership intervals when the NFT transfers. A current subgraph owner does not prove ownership at a historical collection.
5. Store raw `amount0` and `amount1`, collection transaction hash, log index, block, recipient, manager, and NFT ID. Convert to USD separately with a recorded price source and block.

The present implementation already follows steps 1 through 4 for a bounded sample. Its limits are coverage limits, not evidence that a standard Graph fee field exists.

## Version-specific result

### V3

Exact collected fees are obtainable as a standard *on-chain event* approach, not as a standard public-subgraph field. A bespoke subgraph may index the manager `Collect` event, but its entity name and shape are deployment-specific. Probe its schema before using it, and retain the raw-event fallback.

For a complete v3 benchmark, index all manager `Collect`, `IncreaseLiquidity`, `DecreaseLiquidity`, and ERC-721 `Transfer` logs from each reviewed manager address. The public subgraph can reduce discovery work, but it cannot make the result exhaustive because its paging and position coverage are not a complete event archive for collections.

### V2

There is no separate LP fee collection event. V2 fees remain in pool balances and are realized in the pro-rata amounts returned when LP tokens are burned. The pair contract's `burn` calculates token outputs as LP balance divided by total supply times current balances. It also mints protocol-fee liquidity when configured. A wallet's fee component cannot be read from one pool revenue field or one burn event without its historical LP-token ownership, deposits, transfers, pool reserves, total supply, and protocol-fee dilution.[7]

Do not label v2 pool supply-side revenue as wallet-collected fees. A custom v2 accounting indexer can calculate a position's realized return, but separating price movement, donations, rebases, and swap fees requires a stated methodology.

### V4

The official v4 public schema has pool-level `feesUSD` and `collectedFees*`, plus NFT ownership transfer and subscription entities. Its `Position` has ownership metadata only. It has no position fee balance, collection entity, or link from a `ModifyLiquidity` record to a position NFT.[8]

V4 core returns `feesAccrued` from `modifyLiquidity`, but its interface warns that donations can artificially inflate this figure. Hooks can alter fees and token flows. Exact wallet accounting needs a protocol- and hook-aware indexer that joins PositionManager actions, PoolManager modifications, settlements/takes, NFT transfers, and hook events. Do not infer wallet fees from the pool aggregate.[9]

## Recommended benchmark plan

1. Keep the existing 22-source standardized registry for coverage and candidate discovery.
2. Add a source capability probe at startup. Introspect or issue a harmless query for optional source-specific fee entities. Record the schema revision and capability result. Never assume an extension exists because a source says it uses the Messari standard.
3. Change discovery from the current high-withdrawal, 30-day, 5,000-skip sample to durable keyset pagination over the pinned block. Persist the full candidate cursor and scan all eligible v3 positions. This gets all *available standardized position data*, but still not collections.
4. Build a durable v3 log index keyed by chain, manager, block, transaction index, and log index. Scan the reviewed manager event topics independently of candidate discovery. Reconcile every token ID and ownership interval before publishing a row.
5. Report three distinct coverage figures: standardized source indexed through block, manager-event archive scanned through block, and fee-accounting eligibility. Mark a row unknown when any interval is missing. Do not silently omit or zero it.
6. Keep v2 and v4 wallet accounting unavailable until their separate accounting methods and test vectors exist. Continue to display their pool revenue as pool revenue only.

## Sources

[1] The Graph, "Standardized Subgraphs". https://thegraph.com/docs/en/subgraphs/existing-subgraphs/standard-subgraphs/

[2] Messari, `schema-dex-amm-extended.graphql`, version 4.0.1. https://github.com/messari/subgraphs/blob/master/schema-dex-amm-extended.graphql

[3] Uniswap, `INonfungiblePositionManager.sol`. https://github.com/Uniswap/v3-periphery/blob/main/contracts/interfaces/INonfungiblePositionManager.sol

[4] Uniswap, `IUniswapV3PoolEvents.sol`. https://github.com/Uniswap/v3-core/blob/main/contracts/interfaces/pool/IUniswapV3PoolEvents.sol

[5] Messari, Uniswap v3 fork PositionManager mapping. https://github.com/messari/subgraphs/blob/master/subgraphs/uniswap-v3-forks/src/mappings/positionManager.ts

[6] Messari, Uniswap v3 fork position entity helper. https://github.com/messari/subgraphs/blob/master/subgraphs/uniswap-v3-forks/src/common/entities/position.ts

[7] Uniswap, `UniswapV2Pair.sol`. https://github.com/Uniswap/v2-core/blob/master/contracts/UniswapV2Pair.sol

[8] Uniswap, v4 subgraph schema. https://github.com/Uniswap/v4-subgraph/blob/main/schema.graphql

[9] Uniswap, `IPoolManager.sol`. https://github.com/Uniswap/v4-core/blob/main/src/interfaces/IPoolManager.sol
