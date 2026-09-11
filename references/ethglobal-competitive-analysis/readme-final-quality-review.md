# README final quality review

Reviewed September 12, 2026.
This independent review covers README correction `001a294234751f46f91a6fdab270fd5c9a3e2b58` and evidence refresh `4ce9ac4586cbbe03e70fd0417479eab6054ad8a4`.
The working README matched the latter commit byte for byte during verification.
This worker owns only this report and changed no README, implementation, generated file, credentials, or existing evidence.
Current source includes concurrent uncommitted work, so this is a documentation gate rather than final product acceptance.

## Verdict

Changes requested before README acceptance.
Prior findings R3, R4, R5, and R6 are resolved.
R1's transaction wording is resolved, but its development-signer setup and evidence link remain incomplete.
R2's image build, Node minimum, runner connection, and frontend restart instructions are resolved, while provider prerequisites and development instructions still need clarification.
No exposed credential value was found in the reviewed README.

## Required corrections for Luna

### F1: document the optional signer setup that the README says it provides

Priority P2, remaining R1 and R2 scope.
The workflow says that development-signer setup and evidence are separate, and the Evidence section says development-wallet settings belong to the setup sections above.
Those sections list only `PRIVATE_KEY` and omit the required opt-in and exact origin.
`apps/frontend/lib/server/dev-wallet/config.ts` requires development mode, `AQUAMUX_DEV_WALLET=true`, and `AQUAMUX_DEV_WALLET_ORIGIN` matching the browser origin.
The default documented frontend origin is `http://127.0.0.1:3100`.
Link `dev-wallet-results.md` and either provide the server-only opt-in settings or direct readers explicitly to that report's setup.
For a custom port, keep `AQUAMUX_AUTH_ORIGIN` and the development-wallet origin aligned with the actual frontend URL.
Keep the real-funds, explicit-confirmation, loopback, and restricted-chain boundaries.
The configured development signer supports Arbitrum, BNB Chain, and Robinhood Chain, which does not establish Ethereum signer support or general external-wallet compatibility.

### F2: make the setup and verification command context complete

Priority P2, remaining R2 scope.
State before runner startup that the selected provider needs an existing local subscription login.
The later compatibility-matrix prerequisite does not clearly cover the ReviewService quick start.
The runtime uses direct provider authentication and refuses configured hosted-provider credential environments rather than silently falling back.
Do not instruct readers to print or paste credential values into a report.
Docker is required for runner inference and Docker checks, while the frontend can start without it.
Change the unconditional frontend tool prerequisite accordingly.

The Verification section follows commands run from `apps/agent-runner`, but its three npm commands exist only in `apps/frontend`.
Explicitly state the working directory for that section.
`verify:fork` loads `.env`, requires `ARBITRUM_RPC_URL`, and starts its own isolated Anvil instance on `AQUAMUX_TEST_PORT`, default 18547.
Document the RPC prerequisite and the port override for a collision.
`verify:live` reads `verification/live-execution.json` and checks those recorded receipts and positions; describe that input so readers do not mistake it for fresh execution evidence.

### F3: distinguish test discovery from a configured runnable browser suite

Priority P2.
The exact documented `npm run test:e2e -- --list` command successfully discovers 21 tests in five files on the inspected tree.
That confirms script wiring and discovery, not passing browser tests.
The default Playwright configuration starts or reuses port 3100 and discovers `managed.spec.ts`, including the explicit development-wallet connection test.
That test calls `connectDev`, while the documented frontend setup does not enable or configure the development signer.
The separate managed configuration targets `MANAGED_E2E_URL`, default port 33127, and does not start its own server.
Document the accepted test server setup and exact suite command after the UI worker settles its configuration.
Keep ordinary frontend startup distinct from any optional real signer configuration, and do not label the test command self-contained until its fixture prerequisites are met.
This is a source-backed prerequisite finding; this reviewer did not execute the browser suite against a signing-capable server.

### F4: state passive observation and recovery behavior accurately

Priority P2 documentation completeness for the requested polling review.
The README now correctly distinguishes pausing management from closing positions and records the 45-second browser lease.
In the inspected `use-managed-group.ts`, the visible lease-owning tab sends a heartbeat every ten seconds while running and requests a review only when due.
A separate eight-second visible-tab loop attempts recovery and reconciliation only while transaction attempts are submitted or unknown.
Idle or stopped groups without unresolved attempts have no periodic passive-position reconciliation loop in this inspected revision.
Explain that stopping reviews does not stop on-chain fills, and that displaying fresh fills depends on reconciliation rather than treating the heartbeat as continuous chain observation.
Avoid promising continuous passive polling until the relevant implementation and its review establish it.
The UI exposes an explicit reconcile action, which also attempts external-wallet batch recovery before refreshing records.
Recheck this paragraph against the final hook implementation because its owner is editing it concurrently.

## Resolved claims and maintainability

R3 is resolved by shell command substitution without the incorrect `tr` filter.
R4 correctly states the lease timeout, passive-position lifetime, program expiry, confirmed Close, and already-submitted transaction boundary.
R5's original 13-check statement matches the earlier lifecycle evidence.
The later 15-check refresh is supported by the transparent-route addendum in `lifecycle-results.md`, including its recorded isolated-port run, while `lifecycle-quality-review.md` independently records the earlier 13-check revision.
Do not imply that the older quality report independently reran the newer 15-check revision.
Final integration evidence and any live-workflow claims still need a separate refresh and independent review.

R6 correctly distinguishes registry listing, amount-specific route checks, and chain execution evidence.
The installed registry and route-policy modules support keeping those concepts separate.
Signing requires explicit confirmation, the optional local adapter can use real funds, Privy delegation remains disabled, MM remains unavailable, and Hedera charging remains deferred.
The README preserves incomplete observation as unknown and does not claim broad wallet compatibility or full application acceptance from fixtures.

The README remains an appropriate single overview file.
Keep detailed environment and test prerequisites in linked maintained guides rather than growing duplicate command inventories.
No component split or implementation refactor is needed for this documentation deliverable.
ASCII prose and one sentence per physical prose line pass this review.
All relative Markdown links resolve.

## Verification evidence and limits

Read the implementation plan, applicable frontend AGENTS instructions, prior R1-R6 review, package manifests, example environment, signer configuration, runner entrypoint and runtime authentication, frontend runner configuration, managed polling and recovery hook, Playwright configurations and fixtures, fork and receipt verifier entrypoints, lifecycle evidence, and development-wallet evidence.
Compared working README bytes with `4ce9ac4586cbbe03e70fd0417479eab6054ad8a4` successfully.
Checked README ASCII and relative links with a local Python script successfully.
Ran `npm run test:e2e -- --list` from `apps/frontend` successfully and inspected all 21 discovered tests.
All documented npm script names exist in the corresponding package manifests.
The runner's `npm test` already runs `test:service`, so listing both repeats that suite without adding coverage.

No dependency installation, app startup, provider inference, signing, live API request, fork execution, or full browser suite occurred in this review.
No private environment file or credential store was opened.
The coordinator received the initial verdict and owns routing these corrections to Luna.
A final evidence refresh must be independently reviewed at its exact revision before documentation acceptance.
