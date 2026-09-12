# Active review market observations

The original active-group snapshot returned no route observations after a confirmed two-pair opening.
The controlled-fork reproduction exercised the production group snapshot and the actual agent-runner tool, which returned empty quote lists for both destinations.

Active LP snapshots now read source-attested pair quotes at each configured base amount before starting a review.
The recorded values include the pair identities, verified token metadata, exact integer input and output, observation time and expiry.
Coverage states that the reference includes size-dependent price impact and is neither a spot price nor signing authority.
The observation module never supplies executable calls to the model or expands the allowed route set.
Unknown Robinhood source or route provenance therefore remains unavailable.

A replacement-enabled review pauses when a current pair reference cannot be obtained.
A backing-only policy can continue monitoring during a quote outage, with empty quote results and explicit unavailable coverage.
Known maker backing must still be available in either case.
Freshness is checked after all snapshot reads and again after model execution, so a successful model response cannot extend a quote's lifetime.

## Verification

Orca CLI ran controlled fork entry followed by the production active snapshot and actual `route_observations` tool on Ethereum, BNB, Robinhood, and Arbitrum with native and bridged USDC.
Each scenario verified quote delivery, expiry refusal, replacement-review refusal during a removed-route-code outage, and backing-only monitoring with unavailable coverage.
`active-review-observations.json` retains the baseline and all five final scenario outputs.
The final replay used one consolidated observation module after a concurrent duplicate implementation was removed with the coordinator's authorization.
TypeScript, focused ESLint and formatting passed.
No unit tests, public transactions or real wallet-brand compatibility claims were added.
This evidence covers the backend and real agent tool on a controlled fork, not a new model-driven browser journey.

Ownership is limited to the active observation module, review snapshot integration, fork fixture and driver, and this evidence.
The existing agent request schema and tool contract are unchanged.
Independent code-quality and correctness review is required before acceptance.
