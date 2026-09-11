# Token registry research and implementation results

Prepared September 12, 2026 in Asia/Bangkok.

## Outcome

AquaMux now has a server-side token registry that searches the official 1inch Classic Swap token inventory for Ethereum, BNB Chain, Arbitrum, and Robinhood Chain.
The implementation treats a token as an address on one chain, so duplicate symbols cannot silently select the wrong contract.
Registry membership, on-chain metadata validation, and an executable quote for a specific amount and direction remain separate facts.
No transaction was constructed, signed, submitted, or simulated during this work.

The existing committed catalog remains a small fallback for API outages and local development without a 1inch API key.
The generator now selects fallback entries by exact address instead of symbol and preserves their 1inch tags and providers.
It adds AAVE on Ethereum, XVS on BNB Chain, and GMX on Arbitrum because each address passed the representative metadata and route checks described below.

## Current catalog assessment

The previous generator selected tokens by symbol and omitted every symbol with more than one match.
That approach was unsuitable for a larger registry because symbol uniqueness is not guaranteed and can change between snapshots.
The previous committed catalog contained 10 Ethereum entries, 7 BNB Chain entries, 9 Arbitrum entries, and 6 Robinhood Chain entries.

The public 1inch list returned the following inventory during this research.

| Chain           | Chain ID | Registry entries | Duplicate symbols | Previous fallback | Generated fallback |
| --------------- | -------: | ---------------: | ----------------: | ----------------: | -----------------: |
| Ethereum        |        1 |            2,453 |                 4 |                10 |                 11 |
| BNB Chain       |       56 |            1,821 |                 0 |                 7 |                  8 |
| Arbitrum        |    42161 |            1,030 |                 0 |                 9 |                 10 |
| Robinhood Chain |     4663 |              380 |                19 |                 6 |                  6 |

The inventory counts came from `https://tokens.1inch.io/v1.2/{chainId}` between 19:57 and 20:10 UTC on September 11, 2026.
The endpoint returned a six-minute shared cache policy and an ETag, but no `Last-Modified` header.
The response included address, chain ID, symbol, name, decimals, tags, providers, logo URL, and permit metadata.

An authenticated call to the documented Classic Swap `/tokens` method returned exactly the same address set and count as the public list for all four chains.
The [1inch Classic Swap token method](https://portal.1inch.dev/documentation/apis/swap/classic-swap/methods/v6.1/1/tokens/method/get) describes that result as tokens available for swap in the Aggregation Protocol.
That statement is registry-level availability and does not prove that Pathfinder can quote every pair, direction, or amount at a later time.

The lists also carry explicit risk tags.
At the observed snapshot, Ethereum had 190 entries tagged malicious, suspicious, or unverified, BNB Chain had 104, Arbitrum had 23, and Robinhood had none with those three tags.
The absence of those tags is not a security review.
Robinhood still had 19 duplicate symbols, including two records using `HOOD`.

## Public registries and provenance

| Source                                                                                                                            | Freshness observed                                                     | License signal                                                                          | Coverage and use                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| [1inch Classic Swap token method](https://portal.1inch.dev/documentation/apis/swap/classic-swap/methods/v6.1/1/tokens/method/get) | Live authenticated responses on September 11, 2026 UTC                 | Governed by 1inch API terms; the response does not declare a standalone dataset license | Primary runtime source because it matches the route API product and supports all four target chains.                                 |
| [Public 1inch token list](https://tokens.1inch.io/v1.2/1)                                                                         | Live response with a six-minute cache policy on September 11, 2026 UTC | No standalone license was found in the response or linked endpoint                      | Build-time source for the small committed fallback, not proof of an executable route.                                                |
| [1inch assets repository](https://github.com/1inch/assets)                                                                        | Archived; last source push shown as June 26, 2024                      | MIT                                                                                     | An archived fork of Trust Wallet assets, so it is useful for historical provenance but unsuitable as the current primary feed.       |
| [Trust Wallet assets](https://github.com/trustwallet/assets)                                                                      | Active with a September 11, 2026 push during research                  | MIT                                                                                     | Public metadata for Ethereum, Smart Chain, and Arbitrum; no Robinhood blockchain directory was present.                              |
| [Uniswap default token list](https://github.com/Uniswap/default-token-list)                                                       | List timestamp was September 10, 2026                                  | GPL-3.0                                                                                 | Contained 405 Ethereum, 97 BNB Chain, 203 Arbitrum, and 202 Robinhood entries, but list presence still does not prove a 1inch route. |

The 1inch response identifies contributing providers such as CoinGecko, Trust Wallet, Uniswap Labs, Kleros, xStocks, Ondo, Bitstamp, and chain-specific lists.
Provider presence gives provenance context but does not establish endorsement, contract safety, liquidity, or legal permission to redistribute every logo.
For that reason, the implementation does not commit the full 1inch response or download thousands of third-party images.
The runtime serves logo URLs as metadata, while the generated fallback keeps only its small allowlisted image set and restricts downloads to known hosts.
This is an engineering choice, not a legal opinion about any provider's data or trademarks.

## Route and metadata evidence

The verification script read contract bytecode and ERC-20 decimals through each configured chain RPC.
It also requested one authenticated 1inch quote per chain for a raw input amount of `1000000000000000` native units.
Every metadata check and quote completed at approximately 20:11 UTC on September 11, 2026.

| Chain           | Pair        | Address checked                              | Registry decimals | On-chain metadata | Quote result                     |
| --------------- | ----------- | -------------------------------------------- | ----------------: | ----------------- | -------------------------------- |
| Ethereum        | ETH to AAVE | `0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9` |                18 | Verified          | Available for the tested amount. |
| BNB Chain       | BNB to XVS  | `0xcf6bb5389c92bdda8a3747ddb454cb7a64626c63` |                18 | Verified          | Available for the tested amount. |
| Arbitrum        | ETH to GMX  | `0xfc5a1a6eb076a2c7ad06ed22c90d7e710e35ad0a` |                18 | Verified          | Available for the tested amount. |
| Robinhood Chain | ETH to USDG | `0x5fc5360d0400a0fd4f2af552add042d716f1d168` |                 6 | Verified          | Available for the tested amount. |

Earlier research samples also returned quotes for Ethereum USDC, USDT, DAI, LINK, AAVE, and UNI.
BNB Chain samples returned quotes for USDC, USDT, FDUSD, BTCB, and XVS.
Arbitrum samples returned quotes for USDC, ARB, and GMX.
Robinhood samples returned quotes for USDG, WETH, AAPL, TSLA, and PONS.

Exact-symbol lookup found no `CAKE` entry on BNB Chain and no `USDT` entry on Arbitrum in the observed 1inch snapshot.
Robinhood `HOOD` was ambiguous because two addresses shared the symbol.
These observations are why the implementation never resolves a selected token from its symbol alone.

A successful quote proves that 1inch returned a positive output for one pair, direction, amount, and timestamp.
It does not guarantee later execution, price, liquidity depth, settlement, or suitability for an Aqua strategy.
The proposal flow must request a fresh quote for the actual amount and enforce its existing expiry and minimum-output checks.

## Implemented design

`lib/token-registry.ts` owns client-safe registry types, input normalization, risk classification, exact-address lookup, and deterministic search ranking.
It rejects malformed addresses, mismatched chain IDs, invalid decimals, duplicate addresses, and oversized metadata fields.
Search ranks exact addresses before exact symbols and prefixes, but it keeps duplicate-symbol records as separate results.
Records tagged malicious or suspicious remain visible for provenance but are not selectable.
An entry without a 1inch risk tag reports `unknown` rather than implying that somebody reviewed it.

`lib/server/token-registry-source.ts` fetches the authenticated 1inch Classic Swap inventory and caches one validated snapshot per chain for six minutes.
Concurrent refreshes for the same chain share one request.
A failed refresh may use a validated in-memory snapshot for up to 24 hours and marks the response stale and degraded.
After a failed refresh, a 30-second retry delay prevents token-search keystrokes from repeatedly calling an unavailable provider.
If no usable runtime snapshot exists, the server returns the committed fallback and marks it degraded.
Unavailable data remains unavailable instead of becoming an empty token list.

`lib/server/token-validation.ts` owns on-chain metadata checks and amount-specific 1inch route checks.
`lib/server/token-registry.ts` is the stable import boundary that re-exports the source and validation contracts.

`GET /api/tokens?chainId={id}&q={text}&limit={number}` returns a bounded search result with source, fetch time, stale state, degradation state, rejection count, and matching tokens.
Each token has `registryStatus: listed` and `routeStatus: not_checked` until a pair check runs.
The endpoint caps results at 100 records and rejects searches longer than 80 characters.

`POST /api/tokens/validate` accepts a chain ID, source address, destination address, and positive integer amount in raw token units.
It looks up both tokens by chain and address, rejects blocked risk states, reads on-chain bytecode and decimals, compares optional symbol and name responses, and requests one 1inch quote.
Its response keeps source metadata, destination metadata, and route status in separate fields.
Provider errors and invalid quote responses cannot become an available route.

The committed fallback generator uses explicit addresses and fails if a required address disappears from the source.
It validates chain ID, address shape, symbol, name, decimals, unique addresses, and logo host before writing generated files.
It uses each response's media type for the file extension and removed seven existing WebP files that had been mislabeled with `.png` names.
Its console output reports the full registry count, fallback count, and duplicate-symbol count for each chain.

## Test evidence

The focused token registry suite passed 11 tests.
Those tests cover malformed data, wrong-chain records, duplicate addresses and symbols, risk states, search ordering and limits, cache reuse, no-key fallback, decimals mismatch, successful route checks, failed route checks, and API input bounds.
Focused ESLint completed with zero warnings.
The generator completed for all four chains and produced fallback counts of 11, 8, 10, and 6.
The read-only live verification script confirmed contract decimals and one positive quote per supported chain.
An end-to-end request against the existing Next.js development server returned both Robinhood `HOOD` addresses as separate exact-symbol results, and the validation endpoint independently returned verified USDG metadata and an available point-in-time route.
The full frontend test command passed 99 tests, skipped one environment-dependent test, and reported no failures.
The full frontend lint command completed with zero warnings.

The repository-wide TypeScript check was also attempted while other Orca workers were editing shared files.
The latest run failed in `test/managed-auth-next.test.ts` because an in-progress header fixture did not satisfy `HeadersInit`.
No token registry file appeared in the TypeScript error output, and an isolated strict TypeScript check for the registry modules and tests passed.

## Ownership and integration boundary

This worker owns the new registry modules, registry tests, token API routes, verification script, fallback generator change, generated fallback catalog, three new fallback images, and this report.
The UI worker owns token selector and managed proposal integration.
The existing dirty changes in `lib/config.ts`, `components/aquamux.tsx`, and other shared product files were preserved.

The UI should query the registry after a chain is selected, render symbol and shortened address together, and display risk and stale states.
It should keep `routeStatus: not_checked` distinct from an unavailable route.
Before proposal acceptance, it should call the validation endpoint with the actual source, destination, and raw amount, then require matching decimals and an available fresh quote.

The separate code-quality reviewer should inspect the cache lifetime behavior, route error classification, API response naming, and consistency with existing server conventions before integration acceptance.
