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
The coordinator assigned transparent swap-route integration to a separate follow-up task and review.
This delivery covers the restricted signing foundation and does not claim swap-route support.

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
