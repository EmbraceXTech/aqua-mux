# Chain execution integration

Recorded September 12, 2026 in Bangkok time.
This report covers the consolidated execution worker's owned backend, account adapter and fork evidence.
No public transaction was broadcast by this worker.
The application owner separately owns HTTP endpoint wiring, UI controls and browser verification.

## External account adapter

The named adapter is `simple7702-self-signed-v1`.
It supports an authenticated owner whose execution address is the same account and already delegates through EIP-7702 to `0xe6Cae83BdE06E4c305530e199D7217f42808555B`.
The complete implementation runtime hash is `0xcc7b633aef4b2543cb8f37522adf1a401f910f0f6b2430c1eecc11f401ccfcf3`.
An ordinary undelegated account or an unknown delegation fails before an attempt or execution lock is created.
The application does not ask a wallet to install or change its delegation.

The provider must support `eth_signTransaction` without broadcasting.
The backend prepares one EIP-1559 self-transaction containing the exact `executeBatch` calldata and zero outer value.
It verifies the returned signature, sender, destination, chain, calldata, nonce, fee fields and gas limit.
Access lists and authorization changes are unavailable through this external signing adapter.
After wallet approval, the backend repeats account, route, token metadata, deployment, simulation, balance, gas-reserve, policy and expiry checks before broadcasting.
The signed transaction hash is journaled immediately before the RPC send.
A lost send response retains that hash in an unknown attempt for receipt recovery.
The raw signed transaction is not stored as a credential or exposed in report logs.

The account implementation's verified source and compiler input are retained under `apps/frontend/lib/server/external-adapter/fixtures/`.
The source compiled with the pinned Solidity 0.8.28 binary reproduces the complete deployed runtime exactly.
The source permits self-execution and reverts the entire batch when any child call fails.
[Verified account source](https://arbitrum.blockscout.com/api/v2/smart-contracts/0xe6cae83bde06e4c305530e199d7217f42808555b).
The account designation follows the [EIP-7702 specification](https://eips.ethereum.org/EIPS/eip-7702).

## Receipt and recovery proof

A successful receipt alone is insufficient.
The verifier binds the outer transaction and the root call trace to the exact reviewed batch.
A matching subtree within a larger transaction is rejected.
The RPC prestate trace must show the account delegation and the pinned implementation runtime at the start of that transaction.
This avoids treating the end-of-block account code as proof of the code used earlier in the same block.
The development signer's first type-4 transaction additionally requires one exact self-authorization for the pinned implementation, chain and sender nonce transition.
The external adapter itself accepts only type-2 transactions with preexisting delegation.
Missing trace support leaves the receipt unproven and the attempt unresolved.
[Official Geth tracer documentation](https://geth.ethereum.org/docs/developers/evm-tracing/built-in-tracers).

New lifecycle plans bind deployment runtime evidence into the confirmed plan digest.
The final snapshot includes selected token contracts and their EIP-1967 implementation addresses and runtime hashes.
Signing and relay check those deployment hashes and proxy slots again.
This detects a dependency change before submission; it cannot prohibit a token administrator's later on-chain upgrade.

## Controlled-provider fork evidence

Run `npx tsx scripts/verify-external-adapter.ts` from `apps/frontend` with configured upstream RPC endpoints.
The script starts isolated forks on dynamically selected loopback ports, uses a public synthetic fixture key and native balance, and installs the already verified account delegation only on those forks.
It invokes the production lifecycle compiler, account preparation, provider signing helper, backend signed-transaction relay and receipt verifier.
It does not use Playwright or claim a wallet extension was tested.

Arbitrum, BNB and Robinhood passed native-funded entry into two LP pairs and close-and-convert back to wrapped native with explicit unwrap.
All three runs refused an unsupported account before journaling, refused altered signed calldata, recovered a transaction after a deliberately lost transport response and proved rollback of a deposit preceding a failed child call.
The successful close left zero USDC and USDT balances.
Small wrapped-native surplus remained because conversion unwraps conservative receipts; exact residual amounts are retained rather than reported as zero.
The fixture transaction hashes, call digests and residuals are in `external-adapter-fork.json` beside this report.
These hashes belong to isolated forks and are not public-network receipts.

Frontend TypeScript and focused ESLint passed.
The account compiler replay passed with an exact full-runtime match.
The previously added unit test file was removed from the repository deliverable after the user required E2E-only new validation.
The existing trace regression expectation was updated to reject a matching subtree and is corroborated by the fork receipt verifier.

## Ownership and remaining gates

The account implementation checks, preflight, signature binding, execution journal and proof logic are separate focused modules under `lib/server/external-adapter/`.
The provider signing helper is under `lib/external-adapter/` and does not import server runtime code.
The managed-service capability, execution authorization and transaction-proof modules expose the integration boundary.
Lifecycle snapshot and development signer asset checks carry deployment evidence.

Independent code-quality review of this external adapter milestone is required before acceptance.
The application owner must complete authenticated HTTP and Orca browser wiring, including unsupported-provider messaging and unknown-attempt recovery.
No real wallet brand has passed this adapter yet.
Robinhood direct-pool funding now passes with WETH/USDG and WETH/PONS and zero residual token balances; its unknown aggregation router remains unapproved.
Privy delegated execution, market making and Hedera payments remain later milestones.


The final receipt proof also checks each called deployment's runtime and each called proxy's implementation slot and code in the transaction prestate.
This extends dependency checks beyond the pre-broadcast observation to the code and proxy slots actually used during execution.
Expired approval results, mutated direct-route minimums, receivers, input amounts, callback programs and extra calls were refused through the real signing-relay flow on a controlled fork.
The direct source replay passed for all eight Robinhood dependencies.
