# Delegated execution and MM compatibility spike

Checked September 12, 2026, Asia/Bangkok.
This report records read-only source, documentation, RPC, and state-override experiments.
No transaction was signed or broadcast, no payment was collected, and no product code was changed.

## Decision

Keep delegated execution and directional MM disabled until their separate acceptance gates pass.
Privy integration is untested because the inspected environment lacks its credentials and provisioned wallet, not because Privy rejected an authenticated request.
The installed Aqua instruction set cannot execute LimitSwap.
A maker-program deadline is supported by the installed SDK and was exercised against all four deployed routers.
Implement deadline-bearing LP as a separately named LP feature; do not present it as bid/ask MM.

The initial plan explicitly defers Hedera charging in Product scope and Hedera payment boundary.
It also calls MM a subsequent milestone after the initial LP deliverable.
Phase 5 is a later delivery phase containing payment, production inference, richer data, and replay.
Only charging is expressly excluded from the initial implementation; the document does not separately prohibit all research or preparation for every Phase 5 item.
An uncharged ReviewService is explicitly in scope now.

## Environment and provenance

The inspected frontend pins `@1inch/aqua-sdk` 0.3.1 and `@1inch/swap-vm-sdk` 0.4.1.
No Privy package appears in its package manifest.
The vendored SwapVM checkout is `f09a41e689240adc645934f965c8061749397cd2`.
The vendored Aqua checkout is `9c5c42e5840e8741fba3597c48456c9510212b66`.
The installed SwapVM SDK cites source revision `fcca73f95321d4f1bfa7e28f47d5c569cf3ae347`, which is available in local Git history.
That reference is not proof that the deployed runtime was built from that exact revision.

Credential inventory inspected variable names only in the process environment, `apps/frontend/.env`, and `references/aqua-replay/.env`.
The frontend file declares `ARBITRUM_RPC_URL`, `ETHEREUM_RPC_URL`, `BNB_RPC_URL`, `ROBINHOOD_RPC_URL`, `BASE_RPC_URL`, `ONEINCH_API_KEY`, `PRIVATE_KEY`, `THE_GRAPH_API_KEY`, and `AQUA_SUBGRAPH_URL`.
The replay file declares the RPC and Graph names, without the private key or 1inch key.
The process environment had no matching Privy, RPC, private-key, signer, or API-key variable names.
No `PRIVY_APP_ID`, `PRIVY_APP_SECRET`, Privy authorization credential, or provisioned wallet ID was found in this inspection.
The existing `PRIVATE_KEY` is not a scoped Privy credential and was not used.
This inventory does not assert that credentials cannot exist in another secret store.

## Deployed contracts and ABI evidence

The configured Aqua address is `0x1111113ccf1426a8e30e2bff5e005d929bf6a90a`.
The configured AquaSwapVMRouter is `0x111111338c5091e8440b67b168bae16a668ac0de`.
The resolver credential token is `0x26ffc7d378e8e49be2c483295a3e3e511f96a468`.
All addresses had nonempty code on all supported chains.
Aqua code is 5,619 bytes, router code is 20,541 bytes, and credential-token code is 8,303 bytes on each chain.

| Chain | Snapshot block | SwapVM runtime keccak256 |
| --- | --- | --- |
| Ethereum, 1 | 25956353 | `0x1ffc57300722e5a2c523b5131e17c01950f447718449e1c9fd2ab382b3e340f9` |
| Arbitrum, 42161 | 504155270 | `0x7cb8785de84b35bced79fbecbbc6336f473623568cba28b7af3ed001b20d580e` |
| BNB, 56 | 121320648 | `0x1d0fee80375eefa84811dd8231b159e97e4925e3e7a35cd227eb0279d54d3754` |
| Robinhood, 4663 | 60515857 | `0xc945eab9457f0edc9673118443b9cadac7e7bdedf0dd734b260c2f39fef5f1c4` |

Aqua runtime keccak256 is `0x720bc02d220db318164dc3bade86eec1f3655bdc00fc1174de7d816a95c341f8` on all four snapshots.
Do not require equal SwapVM runtime hashes across chains without accounting for constructor immutables.
Direct `eip712Domain()` reads returned name `1inch SwapVM v1.0`, version `1.0.2`, the matching chain ID, and the configured router on every chain.
The quote experiments below verify the installed `quote` calldata and return encoding against deployed code.

The relevant Aqua ABI is `ship(address,bytes,address[],uint256[])`, `dock(address,bytes32,address[])`, `rawBalances(address,address,bytes32,address)`, and `safeBalances(address,address,bytes32,address,address)`.
`rawBalances` returns `uint248 balance` and `uint8 tokensCount`.
Aqua's `Shipped`, `Docked`, `Pulled`, and `Pushed` fields are non-indexed in the SDK and vendored interface.
The installed SwapVM `Swapped(bytes32,address,address,address,address,uint256,uint256)` fields are also non-indexed.
Do not filter maker, app, or hash as indexed topics without separately proving a different deployment ABI.

Historical live registration receipts were fetched again through RPC and decoded successfully as two Shipped and four Pushed events, each with one topic:

| Chain | Re-read successful receipt |
| --- | --- |
| Arbitrum | `0xe1b304f1289219368c89fc722ba6e52a93fcf0c324d74e3431cb89be50a77ef6` |
| BNB | `0x5b5e8d2808e11627aa3450032422dc8b3c33df155f6b3f2d39f78aa3d4adced2` |
| Robinhood | `0x1d83ed15b576c62fc1bd0f0b21f4443ff22e7968bc13a12f3d8f1adea23d1df3` |

These receipts establish actual registration event layout, not recent fills or Privy wallet compatibility.
No complete explorer-verified ABI was obtained: Arbiscan and Robinhood Blockscout requests returned HTTP 403, and Sourcify full-match and partial-match metadata requests returned HTTP 404.
The exact compiler-to-runtime provenance and unexercised ABI members remain unverified.
A 5,000-block Arbitrum log query was refused because the configured provider permits only ten blocks per `eth_getLogs` request on its current tier.
Receipt reads work and avoid that range limit; an indexer must chunk ranges or use another verified provider.

## Read-only instruction experiments

The tests used `eth_call`, with no signing or transaction submission.
Aqua code was replaced only inside each call's state override with a compiled fixture whose `safeBalances` returns 1,000,000 and 2,000,000.
The deployed router and credential-token code were never overridden.
The order maker and nonzero caller were `0x0000000000000000000000000000000000000011`.
Token-in and token-out were synthetic addresses ending in `0012` and `0013`; exact input was 100 raw units.
These are instruction tests with synthetic inventory, not executable funded positions.
Probes used `latest` shortly after the code snapshots, rather than a common pinned block.

| Program | Encoding | Result on all four chains |
| --- | --- | --- |
| SDK Aqua XYC | `0x1100` | Returns input 100 and output 199, followed by an order hash. |
| Maker deadline 1, then XYC | `0x0d0500000000011100` | Reverts with selector `0x09e99adc`, matching installed `DeadlineReached(address,uint256)`. |
| Maker deadline 9999999999, then XYC | `0x0d0502540be3ff1100` | Returns input 100 and output 199. |
| Real tx.origin credential guard, then XYC | `0x211426ffc7d378e8e49be2c483295a3e3e511f96a4681100` | Nonzero uncredentialed caller reverts with `0x39c4052c`, matching `TxOriginTokenBalanceIsZero(address,address)`. |
| SDK RegularProgramBuilder LimitSwap | `0x190101` | Reverts with selector `0xf6ab88ca`; it does not quote as a limit order. |
| Vendored banked LimitSwap | `0x530101` | Reverts with Solidity array-bounds panic `0x32`. |

An initial credential probe omitted `from` and instead received selector `0x89c62b64` from the zero-origin path.
That result alone was insufficient to establish the intended credential refusal, so the test was repeated with the nonzero caller above.
An initial SDK import using bare Node ESM failed on the dependency's extensionless import; the successful probes used the project's `tsx` loader.

To reproduce, run Node with `--import tsx --input-type=module` from `apps/frontend` and load `.env` without printing it.
Compile this fixture with the installed solc and pass its deployed bytecode as the Aqua state override:

```solidity
pragma solidity ^0.8.30;
contract BalancesFixture {
    function safeBalances(address, address, bytes32, address, address)
        external pure returns (uint256, uint256)
    {
        return (1000000, 2000000);
    }
}
```

Build orders with `Order.new`, `MakerTraits.default().with({useAquaInsteadOfSignature: true})`, and `SwapVMContract.encodeQuoteCallData`.
Use `TakerTraits.default()` so the expiry refusal comes from the maker program.
Send `eth_call` parameters `[transaction, "latest", {[AQUA]: {code: fixtureRuntime}}]` to each configured RPC.
The SDK builder expressions are `.xycSwapXD()`, `.deadline({deadline: 1n}).xycSwapXD()`, and `.onlyTxOriginTokenBalanceNonZero({token: new Address(KYC)}).xycSwapXD()`.
The regular limit expression is `new RegularProgramBuilder().limitSwap1D({makerDirectionLt: true}).build()`.
No credential is needed for these read-only tests beyond working RPC access.

## Expiry and resolver implications

The installed AquaProgramBuilder supports `deadline`; the existing LP strategy builder does not currently add it.
Compile expiry into the maker's program before pricing and preserve the resolver guard and fresh salt.
A taker-supplied deadline alone cannot expire a maker quote because another taker can supply a different deadline.
The historical Controls implementation uses `block.timestamp <= deadline`, so expiry is strictly after the deadline.
The probes verified expired and future cases; exact-boundary timestamp behavior still needs a pinned local-fork test.
The vendored current error has a different argument list, another reason to decode deployed errors with the correct version.

Resolver restrictions apply to transaction origin, not merely the calling router or maker wallet.
A maker's delegated signer does not grant a taker a resolver credential.
The existing fork verifier changes credential code locally to permit fills; such fills must remain explicitly labelled credential-fixtured.
This spike did not prove resolver discovery, a credentialed live fill, or that an arbitrary bundler origin can fill.
Do not remove the guard to manufacture a successful demo.

## Privy gates and scoped alternatives

Current primary documentation supports additional signers with signer-specific permissions, atomic EVM `wallet_sendCalls`, time conditions, and removing delegated signers.
The batch recipe uses EIP-7702 with Kernel and describes both sponsored and unsponsored execution.
These are documented capabilities, not tested integration results for AquaMux or any particular configured chain.
Sources: [signers](https://docs.privy.io/wallets/using-wallets/signers/overview), [batch recipe](https://docs.privy.io/recipes/batch-transactions), and [sendCalls API](https://docs.privy.io/api-reference/wallets/ethereum/wallet-send-calls).

The policy reference lists `wallet_sendCalls` and calldata conditions, but limits stateful aggregation references to `eth_signTransaction` and `eth_signUserOperation`.
It does not establish recursive checking of arbitrary encoded calls inside an allowed contract's bytes argument.
Its simulation-before-policy ordering also means a reverting forbidden request is not sufficient evidence of policy refusal.
Source: [policy reference](https://docs.privy.io/controls/policies/overview).

| Gate | Current result | Required next evidence |
| --- | --- | --- |
| Initial delegation and subsequent allowed batch | Not run, missing Privy setup. | Provision app credentials, authorization key, user-owned wallet, and signer policy; obtain an allowed batch receipt without a second owner confirmation. |
| Chain and Kernel compatibility | Not tested through Privy. | Verify exact wallet, chain, Kernel target, atomic capability, and sponsorship mode independently per chain. |
| Harmful second call | Not proven by docs or provider test. | Submit a simulation-valid batch with one allowed call and a second forbidden action; capture explicit policy denial. |
| Nested bytes and arbitrary execution | Unproven recursive enforcement. | Try allowed outer target with forbidden inner transfer, spender, receiver, delegatecall, and policy mutation. |
| Turnover and frequency caps | Stateful batch enforcement not established. | Enforce counters in a verified account module, or disclose application-only counters and leave actions requiring stronger limits manual. |
| Signer expiry | Documentation-supported only. | Attach timestamp limits to every applicable allow rule and test after expiry. |
| Revocation | Documentation-supported only. | Remove signer, read back configuration, and prove another otherwise-valid signing request is refused. |
| Owner close after revocation | Source-compatible design, no Privy integration proof. | Owner docks from the maker wallet after revocation and reads back inactive balances. |

Privy's time example uses the system timestamp; copy the mechanism, not its broad allow-all policy.
Source: [time-bound policy examples](https://docs.privy.io/controls/policies/example-policies/timebound).
`removeSigners` removes additional signers while preserving the user's ability to transact.
Source: [remove signers](https://docs.privy.io/wallets/using-wallets/signers/remove-signers).
Aqua `dock` operates on `msg.sender`'s strategies, so owner recovery must execute through the same maker account.
Revoking a service signer does not dock an Aqua strategy or clear token allowances.

The immediately implementable alternative is owner-confirmed atomic management with browser-bound reviews and unsigned proposals.
For later automation, prefer a dedicated maker smart account with a reviewed session module that accepts typed operations rather than arbitrary target/data calls.
The module must enforce chain, session expiry, nonce, tokens, spenders, receiver, amounts, native value, allowed program family, cumulative counters, and allowed management operations on-chain.
It must inspect every inner operation, prohibit arbitrary delegatecall and recursive execution, and leave an independent owner close path.
Keep the model process separate from signing credentials and reject stale run generations before submission.
This is a proposed implementation requiring tests and review, not an already deployed permission system.

## Concrete MM recommendation

Do not combine regular LimitSwap bytes with the Aqua builder or switch to an unverified router address.
The installed SDK has LimitSwap only in RegularProgramBuilder; AquaProgramBuilder excludes it.
Both current vendored AquaOpcodes and the SDK-cited historical AquaOpcodes exclude LimitSwap.
The current repository's banked opcode assignment also differs from the installed SDK's positional encoding.
Source: [Aqua opcode dispatcher](https://github.com/1inch/swap-vm/blob/fcca73f95321d4f1bfa7e28f47d5c569cf3ae347/src/opcodes/AquaOpcodes.sol), [current opcode list](https://github.com/1inch/swap-vm/blob/f09a41e689240adc645934f965c8061749397cd2/src/libs/OpcodeList.sol), and [LimitSwap implementation](https://github.com/1inch/swap-vm/blob/f09a41e689240adc645934f965c8061749397cd2/src/instructions/LimitSwap.sol).

For a real fixed-price bid/ask milestone, implement and audit a small dedicated Aqua app, or obtain a verified router deployment whose instruction set enforces the same invariants.
A dedicated app is preferable to claiming a regular-signature order is an Aqua position.
Start its implementation and acceptance on an isolated fork; obtain coordinator authorization before deployment or live fills.

Each quote commits to maker, chain, app version, base and quote tokens, direction, integer rate numerator and denominator, maximum maker outflow, expiry, and a unique salt.
Register the exact quote bytes with Aqua and both token entries, including an initially zero input balance where appropriate.
The app validates the supplied quote hash against Aqua registration and enforces direction and expiry on every fill.
Use two separate directional hashes for bid and ask, with the ask consuming base and the bid consuming quote.
Compute exact-input output with floor division and exact-output input with ceiling division, rejecting zero output and amounts exceeding remaining maker outflow.
Use overflow-safe multiplication and division with validated positive rate components.
Do not recompute a quote's fixed price from Aqua's changing input and output balances after a partial fill.

The fill path must atomically transfer the required input to the maker and decrement the registered output allocation through Aqua, with reentrancy protection and exact token-transfer accounting.
Use only reviewed standard ERC-20 tokens initially; fee-on-transfer and rebasing behavior need separate support.
Reject crossed quotes after decimal conversion and rounding, with bid strictly below ask.
Bound each side by actual balance, allowance, remaining virtual allocation, and the group's single inventory ledger.
Prevent two independent quotes from assuming exclusive ownership of the same inventory.
Keep input receipts from silently replenishing the opposite quote's authorized output capacity.
Enforce hard limits in the app or account, not only in an LLM prompt.

Before refresh, reconcile fills and external transfers, compute inventory deviation, and pause on stale price data or missing observations.
Apply a deterministic inventory skew within owner-approved price and size bounds.
Dock both replaced hashes and ship fresh hashes atomically; a final-call failure must preserve the old registrations.
Expiry stops fills even when the browser sleeps; lease expiry stops new reviews and submissions but cannot cancel an already-submitted transaction.
Owner-controlled docking remains available after service signer revocation.
Resolver credential and discovery requirements must be explicitly selected and proven for the new app, without representing it as the existing canonical router.

The MM acceptance suite must demonstrate both directions, partial fills at unchanged rate, exhaustion, wrong-direction refusal, stale-quote refusal, cancellation, replacement rollback, and owner recovery.
It must also test concurrent sibling depletion, receiver tampering, reentrancy, rounding boundaries, and inability to reuse a docked hash.
Report inventory and marked profit net of observed gas and conversion costs; spread capture alone is not net profit.
Until those tests pass, the MM recipe remains unavailable with the specific instruction/deployment reason above.

## Next worker tasks

1. Add maker-program expiry to the supported LP compiler, with owner-confirmed execution, preserved KYC guard, fresh salts, and expiry visible in the preview.
   Verify actual fills before expiry, acceptance at the exact deadline, refusal afterward, and owner docking on a pinned credential-fixtured fork.
2. Build deterministic account policy tests for typed lifecycle operations and malicious inner calls, keeping all provider capability flags false until authenticated evidence exists.
   Provision Privy separately and run the allowed/refused/expired/revoked/owner-close matrix through one assigned transaction executor.
3. Design the directional Aqua quote app described above and compile it only for local-fork acceptance first.
   Review contract invariants and exact compiler/runtime provenance before authorizing deployment or enabling MM.
4. Build monitoring from versioned ABIs and receipt evidence, with ten-block log chunks where the current RPC tier requires them.
   Keep registration, fillability, resolver discovery, and observed fills as separate states.

The existing fork verifier's range-schema reproduction and repair belong to the parallel baseline worker, not this report-only spike.
No generated verification artifacts were overwritten here.
All delegated provider tests, funded MM fills, complete deployed ABI provenance, and production resolver discovery remain outstanding.
