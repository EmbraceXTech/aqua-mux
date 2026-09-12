# Public route safety audit

The authenticated public swap plan endpoint accepted arbitrary API transaction programs before this correction.
An Orca embedded browser request against the production HTTP handler returned HTTP 200 with two calls containing `0xdeadbeef`, despite displaying positive minimum receipts.
The fixture used real Arbitrum fork RPC and registry metadata, a synthetic account, and a deliberately substituted upstream swap response.
No public transaction was submitted.

## Correction

`verified-public-plan.ts` now compiles public swap calls with the same source-attested route policy used by managed execution.
It splits the exact integer budget, binds each destination and maker, derives on-chain quote minima, aggregates exact approval amounts by spender, and revalidates every route after asynchronous allowance reads.
Direct Robinhood routes retain their full ordered call programs rather than being flattened into one router call.
Unknown pools and deployments fail closed.
The existing liquidity builder is retained and is outside this focused correction.
The original dirty `plan.ts` was not edited or committed.

## Verification

Run `npx tsx scripts/verify-public-route-http.ts` through an Orca terminal, open its printed loopback origin in the Orca embedded browser, and click Run public route audit.
The post-fix request returned HTTP 200, consumed zero injected API swap transactions, and emitted two transparent `ethUnoswapTo` calls.
Both decoded receivers matched the authenticated synthetic maker.
The encoded minima were 124987 and 124997 raw units, matching the displayed 0.124987 USDC and 0.124997 paired-token receipts.
Each call spent 50000000000000 wei, conserving the 100000000000000 wei total.
A whole-batch `eth_call` against the fork's deployed contracts succeeded with the synthetic account explicitly delegated on the local fork.
This is controlled-provider evidence and does not establish compatibility with a real wallet brand.
The durable before/after result is `public-route-browser-evidence.json`.
Type checking passed after formatting the owned files.
No unit tests were added or run.

## Remaining boundaries

This correction establishes public plan construction safety, not a new transaction authorization or receipt adapter.
The legacy external-wallet submit path still relies on provider atomic capability reporting and does not have the managed adapter's backend signing and transaction-proof contract.
That separate boundary remains part of the completeness audit.
Ethereum and arbitrary registry assets remain unavailable to this verified compiler until their route dependencies have authoritative source and runtime evidence.
Robinhood's unknown aggregation router remains refused; only the previously verified direct-pool routes are eligible.
