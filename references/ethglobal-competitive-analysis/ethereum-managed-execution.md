# Ethereum managed execution verification

Ethereum is enabled for the verified local development signer and the named `simple7702-self-signed-v1` external account adapter.
The pre-change full lifecycle entry point refused chain 1 in `validateBatchEnvelope` before signing.
The chain was added only after the account runtime matched the previously source-verified implementation and the router, WETH, quoter, and both funding pools passed source and runtime attestation.

## End-to-end evidence

`npx tsx scripts/verify-external-adapter.ts --ethereum` was run through Orca CLI on an isolated Ethereum fork.
The existing fixture uses a synthetic account and locally assigned funding; it does not reuse or refuel the user's wallet.
The controlled EIP-1193 provider executed two native-funded LP registrations, credential-fixtured resolver fills in both directions, atomic replacement, close-and-convert, and production receipt reconciliation.
An uncredentialed resolver origin was rejected with the exact expected credential error before the fork-only credential replacement.
The fill changed shared base backing from 1050000000000000 to 1024415758519288 raw WETH units.
A deliberately failing replacement restored the old positions and inventory through whole-batch rollback.
The local signer proved initial self-authorization and refused changed code and nonce.
The external adapter refused unsupported accounts before journaling, altered signed calldata before broadcast, expiry after wallet approval, and unavailable RPC before journaling.
Ambiguous relay recovery used the exact signed transaction hash and production transaction/prestate proof.
Both quote-token residuals were zero after conversion, while 19744632292805 raw WETH units remained and were reported explicitly.
All local strategy records reconciled as docked and the group reconciled as closed.
The machine-readable evidence, including fork transaction hashes, is `ethereum-adapter-fork.json`.
Formatting and type checking passed.
No unit tests were added or run.
No public transactions were submitted, and no actual wallet brand is claimed as tested.

## Boundaries

Ethereum route support remains limited to the source-attested WETH/USDC and WETH/USDT pools and their supported native wrappers.
The account must match the exact verified runtime and ownership contract; generic EIP-5792 atomic capability reporting is insufficient for this adapter.
This result does not supply public funding to the existing isolated development wallet on Ethereum.
The existing three-chain and bridged-USDC fixture scenarios are preserved as the default invocation, while `--ethereum` writes separate evidence.
Privy automation, market making, and Hedera payment milestones remain disabled or deferred as documented in the implementation plan.
