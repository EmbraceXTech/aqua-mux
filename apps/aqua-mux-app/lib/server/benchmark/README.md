# Benchmark

`/benchmark` is public and read-only. Its navigation link is immediately before Portfolio.

## Run the historical backfill

From `apps/aqua-mux-app`:

```sh
npm run benchmark:index -- --candidates=20
```

The command reads `.env` without printing credentials. It needs `THE_GRAPH_API_KEY`. Wallet replay also needs the chain's `*_RPC_URL`, currently configured for Ethereum, Arbitrum, Base, and BNB Chain. Other chain RPC names are in `replay.ts`.

Results persist in `.data/benchmark.sqlite`. Override with `AQUAMUX_BENCHMARK_DB_PATH`, using the same absolute path for the indexer and Next.js. Run the indexer as a scheduled worker against persistent storage. Do not deploy this SQLite database on an ephemeral serverless filesystem.

The page polls `/api/benchmark` once per minute. Its refresh button reloads the persisted snapshot; it does not start a paid backfill. An empty database produces a truthful empty state, not fixture wallets.

Options:

- `--sources=uniswap-v3-ethereum,uniswap-v3-base` selects deployments from the registry.
- `--candidates=20` replays up to 20 candidate positions per source per invocation. Use `0` for a source-health/pool-revenue refresh only.
- `--days=30` limits discovery to positions **opened** in the preceding 30 days. This is not a fee-earning interval.
- `--skip=40` explicitly selects a page. Without this argument, persisted scan checkpoints continue the previous source's pinned candidate snapshot. A completed scan starts a fresh snapshot on the next invocation.
- `BENCHMARK_RPC_LOG_BLOCKS=10` is the default historical log chunk size. The configured Alchemy free plan rejected larger ranges during live testing. Increase only if the provider permits it.
- `BENCHMARK_MAX_POSITION_BLOCKS=1000` limits the mint-to-last-liquidity-change block span per candidate. Longer histories are excluded from this run and recorded as deferred. With the 10-block free-plan restriction, this biases the sample toward short-lived positions. Use a larger budget and a provider with larger log ranges for a broader backfill. Each position also has a hard limit of 1,000 RPC calls.

Requests are throttled, 429s retry with backoff, GraphQL errors reject partial responses, and source concurrency is limited to three. The indexer records rejected/deferred attempts. Candidate pages stop at the Graph's skip limit of 5,000 before starting a fresh discovery snapshot. It publishes each successfully reconciled position with an idempotent deployment/manager/NFT key. Candidate page checkpoints commit after a page completes, so interrupted pages can be safely retried. Raw RPC log chunks are not persisted.

## What the data actually supports

The registry contains 22 AMM deployments covering Uniswap, SushiSwap, and PancakeSwap on nine chains. Registry membership is **not** a claim that every source is healthy or supports wallet accounting.

Messari's standard AMM schema exposes `DexAmmProtocol.cumulativeSupplySideRevenueUSD`, `totalValueLockedUSD`, and schema/methodology versions. One shared query reads these fields across v2 and v3 DEXes/chains. The coverage view reports each source's indexing timestamp and unavailable/stale states. Pool revenue is never allocated to wallets using current liquidity shares.

The extended standard has `Position`, `Account`, deposit/withdraw totals, ownership, and position snapshots. It does **not** contain a standardized position/wallet swap-fee total. Rewards are not swap fees. `cumulativeWithdrawUSD - cumulativeDepositUSD` is not a fee calculation.

The linked Uniswap v4 deployment exposes NFT ownership, not position fee accounting. It is probed separately, and contributes neither pool LP revenue nor wallet fee totals. V2 and v4 wallet accounting remain **unimplemented**, not zero. V3 sources with no eligible principal-settled histories or no historical RPC also contribute no wallet rows.

## Wallet accounting

1. Pin a standardized source snapshot 100 blocks behind its indexed head. Discover positions opened within the scan window, ordered by cumulative withdrawals. This discovers candidates, **not** the highest-fee wallets globally.
2. Resolve the NFT from its mint transaction. Match Messari's `concatI32(tokenId)` ID suffix against actual mint events instead of assuming the ID is a full-width NFT ID. Reject ambiguous matches.
3. Verify the RPC chain ID. Replay `Transfer`, `IncreaseLiquidity`, `DecreaseLiquidity`, and `Collect` events from the mint block through the last indexed liquidity-change snapshot or closure block, in block/transaction/log order. Confirm that cutoff block did not reorganize during replay. Collection-only activity after this block is outside the audited interval.
4. Use bigint token amounts. A decrease creates principal debt. A collection pays down that debt first. Remaining collections are fee tokens. Require an observed mint, nonnegative ending liquidity, fully settled principal, and positive collected fees. Positions may still be open; the UI distinguishes open and closed at the cutoff. This does not estimate their uncollected fees. Reject ownership transfers rather than attributing past fees to the current owner. The account is the NFT owner, not necessarily an EOA or the transaction sender.
5. Fetch token prices via a Graph time-travel query at the final collection block. Value **all** fee tokens at those block's subgraph prices. These are derived prices, not an independently verified market price or cash proceeds at each historical collection. Missing/zero prices preserve the verified fee-token history with `feesUSD: null`. The UI labels it unpriced, excludes it from USD totals, and places unpriced-only wallets after priced wallets for either USD sort direction. They are not assigned a USD rank.
6. Persist raw net fee token amounts, owner, manager, NFT ID, pool, valuation block, audit cutoff, and the final collection transaction. Wallet details expose this provenance and transaction explorer links.

The result is actual principal-adjusted fee **collections through the audited cutoff**, not total generated/accrued fees or complete position lifetime fees. Later collection-only transactions after the last indexed liquidity change are outside the audited interval. Uncollected fees, transferred position histories, gas, impermanent loss, token incentives, and tax are excluded. These figures must not be described as profit, APR, or expected user earnings.

Subgraph cumulative deposits can reuse the same capital and reflect the source's valuation methodology. They are displayed for scale only, never used as an APR/ROI denominator.

Filters apply to individual position contributions **before** grouping by lowercase wallet across deployments. Minimum-fee filtering and numeric sorting apply after grouping. A wallet with both priced and unpriced histories displays its known USD subtotal plus an explicit unpriced-history warning. Pagination applies last. The date selector uses the final collection timestamp of each position, not fees earned within the selected interval. Tie-breaking is deterministic by wallet address.

## Remaining work for exhaustive coverage

- V2 fee accrual needs historical LP ownership, supply/protocol-fee dilution, swaps and reserve accounting. The standardized pool revenue alone cannot establish wallet earnings.
- V4 needs position/ownership history plus pool-manager fee-growth accounting and hook-specific handling. Ownership-only subgraphs cannot supply those amounts.
- Full v3 earned fees need fee-growth accounting, transferred ownership periods, collection-only activity after the cutoff, longer histories, and complete candidate discovery rather than the bounded high-withdrawal sample.
- Scale ingestion with durable raw-event storage, reorg-aware checkpoints and a non-ephemeral production worker/database. Current records and candidate-page progress persist; long RPC histories do not resume mid-position.

## Verify

```sh
npx tsx --test test/benchmark.test.ts
BENCHMARK_TEST_ORIGIN=http://127.0.0.1:3101 npx tsx scripts/test-benchmark-ui.ts
```

The browser smoke test requires a real populated backfill. It checks navigation placement, live rows, address filtering, numeric sort direction, version filtering, coverage, provenance links, and mobile overflow in an isolated browser with no wallet connection.

## Sources

- https://thegraph.com/docs/en/subgraphs/existing-subgraphs/standard-subgraphs/
- https://github.com/messari/subgraphs/blob/master/schema-dex-amm.graphql
- https://github.com/messari/subgraphs/blob/master/schema-dex-amm-extended.graphql
- https://github.com/messari/subgraphs/blob/master/deployment/decentralized_network_deployments.csv
- https://github.com/messari/subgraphs/blob/master/subgraphs/uniswap-v3-forks/src/mappings/positionManager.ts
- https://github.com/messari/subgraphs/blob/master/subgraphs/uniswap-v3-forks/src/common/entities/position.ts
- https://developers.uniswap.org/docs/ecosystem/subgraphs/overview
- https://github.com/Uniswap/v4-subgraph/blob/main/schema.graphql
