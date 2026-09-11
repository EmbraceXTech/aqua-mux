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
The successful Arbitrum and BNB closes left zero USDC and USDT balances.
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

Independent review accepted backend commits `d95f893`, `fd68e4a`, `41ae2f7` and the additional bridged-USDC route commit `e123941`.
The full lifecycle evidence below is a subsequent focused deliverable for independent review.
The application owner must complete authenticated HTTP and Orca browser wiring, including unsupported-provider messaging and unknown-attempt recovery.
No real wallet brand has passed this adapter yet.
Robinhood direct-pool funding now passes with WETH/USDG and WETH/PONS and zero residual token balances; its unknown aggregation router remains unapproved.
Privy delegated execution, market making and Hedera payments remain later milestones.

The final receipt proof also checks each called deployment's runtime and each called proxy's implementation slot and code in the transaction prestate.
This extends dependency checks beyond the pre-broadcast observation to the code and proxy slots actually used during execution.
Expired approval results, mutated direct-route minimums, receivers, input amounts, callback programs and extra calls were refused through the real signing-relay flow on a controlled fork.
The direct source replay passed for all eight Robinhood dependencies.


## Final account and transport guards

The local signer rereads the chain, implementation runtime, owner delegation and pending nonce before signing and again immediately before its broadcast callback.
The controlled fork exercises its initial self-authorized EIP-7702 transaction on every target chain, including Robinhood, and verifies its exact transaction, authorization, call trace and prestate proof.
Changing account implementation code or the pending nonce after signing refuses broadcast before the journal callback.
Each local-signing check runs inside an isolated fork snapshot and restores that snapshot before the external adapter workflow.

Unavailable external RPC or verification now returns the named `external_preflight_unavailable` conflict without creating an attempt.
Existing precise account, policy and expiry errors remain intact.
The fork flow temporarily points only its process-local endpoint to a closed loopback port and verifies the named refusal and zero journal entries before continuing.
No upstream error text, credential, signed transaction or real private key is included in this evidence.


## Complete controlled-fork lifecycle

The expanded verifier runs four scenarios: Arbitrum native USDC with USDT, BNB USDC with USDT, Robinhood USDG with PONS, and Arbitrum bridged USDC.e with USDT.
Each scenario starts with synthetic native funding, compiles and confirms two positions, and executes through the named external signing adapter.
The production `reconcileManagedTransactions` function now settles each submitted or unknown attempt, verifies execution proof, persists active and docked strategy records, updates the group and releases the execution lock.
The verifier no longer finalizes transaction attempts manually.
It injects an isolated in-memory store only within the verification process and restores the previous store reference afterward.

After entry, a second synthetic account fills the first strategy in both directions through the actual deployed SwapVM and real token contracts.
The uncredentialed origin is first refused.
Only the resolver credential contract is temporarily replaced with an explicit local fixture returning a positive balance, then restored after the fills.
No production credential check or strategy program is removed.
The reverse fill reduces the maker's real base balance shared with the sibling pair.
The artifact records both fill hashes and the exact base balances before and after that outflow.
This proves execution under a credential fixture, not public resolver discovery or production access eligibility.

A fresh replacement uses the observed post-fill inventory and recomputed pair prices.
An intentionally invalid last call first forces the replacement batch to revert on the fork.
The verifier reads old and proposed registrations, virtual balances and real token balances before and after the failed batch and requires exact equality.
The valid replacement then executes through the production external adapter and receipt reconciliation docks the old strategy records.
A final signed close-and-convert retires the replacements and leaves the group closed with every strategy record docked.
Robinhood again leaves zero WETH, USDG and PONS; the other scenarios retain explicitly reported conservative wrapped-native surplus.

Verification concerns are split into focused scenario configuration, external signing and reconciliation, local signer, resolver fill, rollback and altered-call helpers under `scripts/fixtures/`.
The main script orchestrates the four scenarios and writes the evidence artifact.
No public transaction, actual wallet extension or real resolver credential was used.
Privy automation, market making and Hedera payments remain outside this Phase 1 execution deliverable.


## Conversion recovery after close-only

The authenticated app flow exposed a compiler guard that required an active retirement even when the user had already closed positions and explicitly selected remaining inventory for conversion.
The guard now permits zero retirements only for close-and-convert with a positive conversion amount covered by explicitly selected inventory.
Close-only and replacement still require active prior strategies, and every conversion amount remains bounded by current balances, selected inventory, allowed assets and reviewed routes.
The bridged-USDC fork scenario now closes positions first and then signs a separate zero-retirement inventory conversion through the production adapter and receipt reconciler.
The same scenario refuses an empty selection before preparing a transaction.
