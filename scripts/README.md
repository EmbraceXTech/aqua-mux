# Scripts

Run each command from the repository root. Scripts load the root `.env` file.

```sh
npx tsx scripts/<script>.ts ...
```

Do not commit `.env`. Private-key variables must contain a 32-byte EVM private key.

## Refresh curated token lists

```sh
npm run refresh-token-list -- --chain 42161
```

Arbitrum combines Trust Wallet Assets, Camelot's default token list, and the public 1inch Token List. The refresh script removes duplicate addresses, excludes 1inch entries marked `RISK:malicious` or `RISK:suspicious`, and does not add the `0xeeee...` native-token placeholder as an ERC-20. The list is display metadata only. Check a token contract on-chain before building a transaction.

Use `--dry-run` to inspect source counts without changing files. Run the parser fixtures with:

```sh
npm run refresh-token-list -- --self-test
```

## Check a wallet balance

```sh
npx tsx scripts/check-wallet-balance.ts PRIVATE_KEY_1
```

The script prints native balances for Ethereum, Arbitrum, Robinhood Chain, and BNB Chain. It discovers ERC-20 holdings through The Graph Token API on Ethereum, Arbitrum, and BNB Chain, and through Alchemy on Robinhood Chain.

Required environment variables:

```dotenv
ETHEREUM_RPC_URL=
ARBITRUM_RPC_URL=
ROBINHOOD_RPC_URL=
BNB_RPC_URL=
THE_GRAPH_TOKEN_API_TOKEN=
ALCHEMY_API_KEY=
```

If token discovery fails, the balance script checks its curated token fallback list.

## Get an address from a private-key variable

```sh
npx tsx scripts/get-wallet-address.ts PRIVATE_KEY_2
```

Use this before a transfer to confirm the receiving address without printing the private key.

## Transfer native currency or an ERC-20

```sh
npx tsx scripts/transfer.ts <SOURCE_KEY_VARIABLE> <chain> <recipient> <asset> <amount> --execute
```

`<chain>` must be `Ethereum`, `Arbitrum`, `Robinhood Chain`, or `BNB Chain`.

`<asset>` is `native` or an ERC-20 contract address. `<amount>` is a decimal amount in the asset's display units. Use `max` only with `native`; it transfers the current native balance less the estimated gas fee.

The command broadcasts an irreversible transaction only when it includes the exact `--execute` argument. ERC-20 transfers run a contract simulation before submission, but a successful simulation does not guarantee that the submitted transaction will be mined.

Examples:

```sh
# Send 0.001 ETH on Arbitrum.
npx tsx scripts/transfer.ts PRIVATE_KEY_1 Arbitrum 0x8Ce7c527f1DAB2c46d5643FD5C0e4bfe4427A348 native 0.001 --execute

# Send 1.25 USDC on Arbitrum.
npx tsx scripts/transfer.ts PRIVATE_KEY_1 Arbitrum 0x8Ce7c527f1DAB2c46d5643FD5C0e4bfe4427A348 0xaf88d065e77c8cc2239327c5edb3a432268e5831 1.25 --execute

# Sweep native BNB, reserving estimated gas.
npx tsx scripts/transfer.ts PRIVATE_KEY_1 "BNB Chain" 0x8Ce7c527f1DAB2c46d5643FD5C0e4bfe4427A348 native max --execute
```

## Transfer-all use case

To move assets from `PRIVATE_KEY_1` to `PRIVATE_KEY_2`, first resolve and verify the receiving address:

```sh
npx tsx scripts/get-wallet-address.ts PRIVATE_KEY_2
```

For the recorded transfer, the destination was:

```text
0x8Ce7c527f1DAB2c46d5643FD5C0e4bfe4427A348
```

List the source holdings and transfer every positive ERC-20 balance one contract at a time. Transfer ERC-20 tokens before sweeping native currency, because each token transfer requires native gas.

```sh
# Arbitrum WETH and USDC.
npx tsx scripts/transfer.ts PRIVATE_KEY_1 Arbitrum 0x8Ce7c527f1DAB2c46d5643FD5C0e4bfe4427A348 0x82af49447d8a07e3bd95bd0d56f35241523fbab1 0.000209226636101739 --execute
npx tsx scripts/transfer.ts PRIVATE_KEY_1 Arbitrum 0x8Ce7c527f1DAB2c46d5643FD5C0e4bfe4427A348 0xaf88d065e77c8cc2239327c5edb3a432268e5831 0.39135 --execute

# Sweep the remaining Arbitrum ETH after token transfers.
npx tsx scripts/transfer.ts PRIVATE_KEY_1 Arbitrum 0x8Ce7c527f1DAB2c46d5643FD5C0e4bfe4427A348 native max --execute
```

Check both wallets after transfers:

```sh
npx tsx scripts/check-wallet-balance.ts PRIVATE_KEY_1
npx tsx scripts/check-wallet-balance.ts PRIVATE_KEY_2
```

A token can reject a standard ERC-20 `transfer`. In the recorded Robinhood Chain transfer, the PONS contract at `0x91da2b31cc53c829b7bf1907bddd385e261c6a28` and the MEME contract at `0xc9ec05ed00de82629cdb1d6c3ea5d34f383a5396` reverted with `0xe450d38c`. Investigate the token contract's transfer restrictions before retrying.
