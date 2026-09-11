# Local development wallet implementation

Recorded September 12, 2026.
This adapter signs real transactions with the server's configured development wallet.
It is separate from external wallets and delegated automation.
No real transaction was submitted by this implementation worker.

## Ownership and interfaces

The worker owns `apps/frontend/lib/server/dev-wallet/`, `apps/frontend/app/api/dev-wallet/`, `apps/frontend/lib/dev-wallet.ts`, and the normalization helper in `apps/frontend/lib/wallet.ts`.
The coordinator additionally authorized the frontend `package.json` test command so default test discovery includes the wallet tests.
The existing dirty frontend, chart, configuration, planner, and strategy changes were preserved.

Browser callers use `connectDevWallet`, `prepareDevWalletPlan`, `prepareDevWalletLifecyclePlan`, `submitDevWalletPlan`, `devWalletStatus`, and `disconnectDevWallet`.
Managed preparation accepts an optional browser lease context containing its session ID and run generation.
The authentication session and browser lease identity remain separate.
Execution accepts an opaque stored review ID, digest, and explicit confirmation flag.
The API rejects extra calldata, transaction, signer, and signature fields.
There is no general message-signing or raw-transaction endpoint.

The shared `WalletAuth` challenge proves the configured maker's ownership during connect.
The challenge signature stays on the server.
The browser receives an ordinary owner session token plus a development-wallet session scope.
Disconnect revokes the bearer session and development scope.
The shared `ManagedStore` holds reviews, transaction attempts, and fenced execution locks across restart.
Managed plans use the common execution guards and receipt reconciliation service.

## Local setup

Start the existing loopback-bound Next development server with these explicit settings:

```sh
AQUAMUX_DEV_WALLET=true
AQUAMUX_DEV_WALLET_ORIGIN=http://127.0.0.1:33127
AQUAMUX_AUTH_ORIGIN=http://127.0.0.1:33127
AQUAMUX_DEV_WALLET_MAX_FEE_WEI=300000000000000
```

The fee cap above matches the existing live verifier's cap of 0.0003 native units.
Each prepared review retains its fee cap; managed reviews also apply the strategy policy's gas budget.
The existing `.env` supplies `PRIVATE_KEY` and chain RPC settings to the server only.
Do not expose this development server through a public bind address or proxy.
The mode requires `NODE_ENV=development`, an explicit opt-in, exact browser Origin and Host, a same-origin request marker, and loopback transport metadata.
Next's internal request URL may use a loopback hostname alias only with the same protocol and port and exact external Origin and Host checks.
Production execution is disabled even if the opt-in is set.

## Network and account verification

Read-only RPC checks returned the expected chain IDs and pinned implementation code hash on all supported chains.

| Chain ID | Explicit label | RPC identity | Account implementation hash |
| --- | --- | --- | --- |
| 56 | BNB Chain mainnet | 56 | Matched |
| 42161 | Arbitrum One mainnet | 42161 | Matched |
| 4663 | Robinhood Chain mainnet | 4663 | Matched |

Robinhood's current [network documentation](https://docs.robinhood.com/chain/connecting/) identifies 4663 as mainnet and 46630 as testnet.
The adapter rejects 46630, BNB testnet 97, Arbitrum Sepolia 421614, and unsupported chains.

The pinned account implementation is `0xe6Cae83BdE06E4c305530e199D7217f42808555B`.
Its runtime code hash is `0xcc7b633aef4b2543cb8f37522adf1a401f910f0f6b2430c1eecc11f401ccfcf3`.
Both values match `scripts/live-e2e.ts` and the current RPC reads.
The signer refuses an existing delegation to any other implementation.

## Execution guarantees and limits

Every call is encoded into one self-executed `executeBatch` transaction.
There is no fallback to sequential transactions.
An undelegated maker uses EIP-7702 self-authorization with authorization nonce equal to transaction nonce plus one.
Simulation checks the complete batch before signing.
The managed plan's gas reserve survives adaptation, and the signer checks fresh native balance and fee conditions before signing and immediately before broadcast.
The signer applies the configured fee ceiling and the reviewed fee ceiling.

Final authorization and balance guards run before the synchronous durable journal callback.
The callback records hash and nonce immediately before the network send.
A known prebroadcast refusal releases the definitely unused lock without recording an impossible transaction hash.
An ambiguous network response keeps the known hash and unresolved lock for reconciliation.
Repeated requests never automatically rebroadcast.
Outcomes are pending, confirmed, reverted, or unknown.
Unknown does not authorize a retry.

The read-only lifecycle simulator checks batch structure and uses a pinned account-code override without accessing the key.
Simulation alone does not establish external-wallet compatibility.
EIP-7702 account delegation can remain after a batch failure or application disconnect.
Disconnecting the application does not clear on-chain delegation or token approvals.

Unverified nested aggregator executor programs are refused by the local signing policy.
The adversarial review fixture that advertised one input amount and strong output minimums while encoding different spend and receipts now fails before a review can be executed.
Already-funded LP registration and close-only calls remain supported by the deterministic compiler path.
The original foundation delivery excluded every swap route.
The coordinator assigned the bounded transparent-route integration described below to a separate follow-up task and review.

## Validation evidence

The focused suite currently has eight passing tests covering origin and production guards, ownership challenge and disconnect, explicit confirmation, extra calldata rejection, maker and digest binding, shared lock serialization, ambiguous restart recovery, known prebroadcast refusal, and actual cryptographic signing against a local RPC fixture.
The signing fixture checks EIP-7702 chain and nonce fields, the encoded atomic batch, the prebroadcast hash, reserve insufficiency, a post-sign balance drop, unknown delegation, wrong RPC chain, and changed fee limits.
It uses a public deterministic fixture key and never loads `.env`.
Default `npm test` includes these tests.
The final complete default run discovered 101 tests, with 100 passing, one optional live-Next authentication test skipped, and zero failures.
Frontend typechecking and scoped ESLint passed.

An Orca browser click reproduced the Next internal-URL alias refusal before the guard fix.
After the fix and shared authentication correction, HTTP connect and disconnect against the running Next server on port 33127 both returned 200 using the configured development account.
Responses exposed network labels and the public fee cap only in the recorded smoke output.
The bearer token, private key, challenge signature, and signed transaction bytes were not printed.

Independent code-quality review is assigned to the coordinator's signer reviewer, dispatch `ctx_0332acce0a00`.
Its initial findings drove route refusal, default test discovery, reserve preservation, and prebroadcast journal ordering corrections.
Live transaction testing remains reserved for the coordinator's designated execution worker so account nonces are serialized.

## Recorded smoke result

The configured server returned the following public result during the read-only smoke check:

```json
{
  "origin": "http://127.0.0.1:33127",
  "connectStatus": 200,
  "mode": "local-development",
  "networks": [
    { "chainId": 56, "name": "BNB Chain mainnet", "testnet": false },
    { "chainId": 42161, "name": "Arbitrum One mainnet", "testnet": false },
    { "chainId": 4663, "name": "Robinhood Chain mainnet", "testnet": false }
  ],
  "maxFeeWei": "300000000000000",
  "disconnectStatus": 200,
  "liveTransactionsSubmitted": 0
}
```

The implementation commits are `797d002` for the initial guard and signer and `98eed70` for scoped authentication, durable execution, tests, and integration corrections.

## Transparent route integration

Integration dispatch `ctx_51e6cbc98730` adds the route-policy module's bounded transparent swap path to the development wallet.
The route-policy worker owns deployment source verification, pinned router and pool hashes, transparent calldata compilation, and read-only quotes.
This signer integration owns `compile.ts`, `routes.ts`, `managed-plan.ts`, and the adapter changes within `lib/server/dev-wallet`.
It does not add a generic executor fallback.

The dedicated basket compiler resolves address-only input through the server's verified token registry snapshot.
It derives each route request from the source amount, per-leg allocation, destination, and slippage setting before calling the verified quote helper.
The compiler retains that independent request alongside the returned route.
Displayed minimum receipts come from the validated route minimum and verified token decimals.
The stored plan digest includes these records.
Quote code receives a copy of the independent request so it cannot overwrite the compiler's reference values.

Managed execution reads the owner-scoped `plan-routes` record written by the managed compiler.
It requires both the plan digest and the canonical `routesDigest` to match.
Every router call must match exactly one route record in order.
The signer validates source amount, receiver, destination, calldata, native value, expiry, and pinned route policy through the shared route validator.
Aggregate encoded minimums must equal the canonical displayed minimum receipts.
Displayed token decimals must match the independently retained metadata.

The adapter preserves token metadata from managed inventory, receipts, and independent route requests.
The legacy full-token `verifiedTokens` field remains compatible; managed minimal metadata uses `assetMetadata`.
The signer rechecks deployed token code and decimals before signing and broadcast.
It also rechecks the current route deployment bytecode before both boundaries.
Reserve retention, generation checks, idempotency, final guard ordering, and unknown-send locking remain in effect.
Read-only simulation continues to use structural batch validation without granting signing authority.

At the original integration checkpoint, the route-policy manifest supported Arbitrum WETH or native ETH pairs with USDC and the token labelled USDT0 by the registry.
Route support follows the current pinned manifest and its separately reviewed deployment evidence.
The signer still supports already-funded LP and close-only execution on its configured BNB, Robinhood, and Arbitrum chains.
This report does not claim verified swap routes on BNB or Robinhood.

An authenticated request to the running Next server prepared an Arbitrum basket paying 0.00002 ETH, split equally into USDC and USDT0.
Connect, preparation, and disconnect each returned 200.
The response contained two verified route records.
At that observation, the encoded and displayed minimums were 25089 USDC base units and 25090 USDT0 base units, both with six decimals.
These are historical quote observations, not current executable quotes.
No transaction was signed or broadcast during this check.

The integration regressions exercise real dev-wallet preparation with controlled quote responses, not just a standalone calldata helper.
They reject substituted source spend, destination, minimum receipt, arbitrary executor bytes, mutated quote-request input, missing or duplicated route records, receipt-decimal mismatch, and changed canonical route records.
Managed adaptation tests preserve the gas reserve and reject both plan-digest and routes-digest mismatches.
The dynamic metadata tests reject missing token code, conflicting decimals, and changed on-chain decimals.
The focused suite passed 15 tests after the integration changes.
The integration's full default run discovered 142 tests, with 141 passing, one optional live-Next test skipped, and no failures.
Frontend typechecking and scoped ESLint passed at the same checkpoint.
Separate integration review and designated-worker live execution remain required before claiming the complete transaction workflow.

## Resumed integration validation

Dispatch `ctx_d6e714520793` inherited the uncommitted integration and preserved the accepted signer foundation.
Commit `42b25fca237ddcdccc6651b62037dcfa09db7c8c` contains only 14 files under `apps/frontend/lib/server/dev-wallet`.
It includes the transparent basket compiler, managed route adapter, receipt validation, signer provenance checks, token metadata adaptation, and their tests.
The compiler now consumes the immutable token resolver supplied by the registry integration.
The route-policy owner separately maintains the expanded BNB manifest and Arbitrum wrapped-token proxy verification.
This signer report does not independently certify those deployment additions.

The new aggregate receipt regression reproduced a validation gap before the fix.
Two differently cased addresses for one output token could conceal the missing receipt for another output token with the same minimum amount.
Duplicate detection now normalizes token addresses before comparison.
The tests also require multiple routes to one destination to produce one receipt with their exact summed minimum.

`signer-routes.test.ts` uses an ephemeral loopback RPC server and a public deterministic fixture key.
It never loads the environment file or connects to a real RPC.
Eight mutation scenarios run both before signing and after signing but before broadcast.
They cover expiry, router code, pool code, wrapped-token proxy code, proxy implementation code, the proxy implementation slot, RPC chain identity, and token decimals.
Every refused case leaves both the journal callback count and the RPC send count at zero.
A valid fixture signs and sends once to the loopback server, establishing that the test exercises the accepted signing path too.
Existing reserve, generation, idempotency, known-unsent, and unknown-send regressions remain passing.

The focused dev-wallet suite passed all 18 tests, and scoped ESLint passed.
The independent reviewer separately reran 30 integration tests and reported no requested module split refactor before the final commit.
Exact-commit acceptance is assigned to `ctx_f2f8da360364`.
The most recent full-suite checkpoint had 148 passing tests, two failing legacy-token integration tests, and one optional live-Next skip during concurrent resolver changes.
Full typechecking at that checkpoint reported only other owners' quote, UI, and managed snapshot test fixture migrations.
Those failures were reported to the coordinator and responsible owner for correction; this checkpoint does not claim a green full checkout.

The commit used the audited common-directory lock, a fresh private index, an exact owned-path manifest, and restricted local recovery backups.
Precommit and postcommit checks verified the parent, committed path set, owned working-file hashes, and preservation of unrelated ordinary-index entries.
Only the authorized committed paths were synchronized into the ordinary index.
No UI files, generated files, changelogs, other workers' source, or real transactions were changed by this dispatch.
