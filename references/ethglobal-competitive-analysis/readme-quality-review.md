# README quality review

Reviewed September 12, 2026.
The reviewed README is commit `009c28a5b6f9e29744d76f8e22f3ed91d4a3185a`, which matched the working README byte for byte during review.
This worker owns only `references/ethglobal-competitive-analysis/readme-quality-review.md` and changed no source, README, generated file, or existing evidence.
The comparison uses current source and implementation reports, including concurrent uncommitted integration work, so it is an interim documentation review rather than final integration acceptance.

## Verdict

Changes are requested for setup accuracy, transaction wording, passive-position behavior, and stale evidence.
The clearly stated incomplete E2E boundary is appropriate and is not a defect.
Luna should apply the corrections during the assigned final refresh after E2E, then submit that exact revision for final independent review.

## Findings

### R1: frontend transaction wording understates real signing paths

Priority P1.
`README.md:93` says that the normal frontend does not submit transactions.
The basket UI calls `submitPlan` in `apps/frontend/components/aquamux.tsx`, and the managed action hook calls either the external-wallet submission path or `submitDevWalletPlan` after confirmation.
The local development adapter signs real transactions, as explicitly recorded in `dev-wallet-results.md:4`, and is not a simulated wallet fixture.
The narrower statement at `README.md:168` about the only documented live verification command is defensible as a command inventory, but does not repair the broader frontend claim.

Replace the broad assertion with the actual boundary: starting the app and read-only verification do not submit by themselves, while explicit wallet confirmation can submit real transactions.
Describe the development signer as an optional real-funds local adapter with explicit opt-in, and link its setup and evidence separately from external-wallet compatibility and fork fixtures.
Do not imply that enabling this adapter establishes general browser-wallet compatibility.
No real signing was attempted during this review.

### R2: the runner quick start is incomplete on a fresh setup

Priority P2.
The sequence at `README.md:100-108` installs dependencies and starts the service, but omits building its Docker image.
`apps/agent-runner/src/container-policy.mjs:46` inspects `aquamux-runtime-spike:local` before creating a review container; it does not build the image.
The image build command appears later under development checks, where a reader can reasonably treat it as optional testing.
A service listener can start without establishing that its first review can acquire a runtime.

Move `npm run image:build` into the runner setup before `npm run service`, and state that the chosen provider needs an existing local subscription login there.
Docker is required for inference and Docker checks, rather than for merely starting the frontend.
The runner package declares Node `>=22.13`, and both applications use `node:sqlite`, so replace the broader Node 22 minimum with the supported package minimum or the recorded tested version.
No older Node compatibility claim was independently exercised.

The frontend starts in the first terminal before the second terminal generates its token.
Exports in that second terminal do not configure the already-running frontend.
`apps/frontend/lib/server/managed-service/runner.ts:144-153` requires both the runner URL and matching bearer token and otherwise returns `runner_unavailable`.
Give an explicit frontend server configuration step using `AQUAMUX_AGENT_RUNNER_URL=http://127.0.0.1:4319` and the same privately supplied token, followed by restarting the frontend.
Do not print the token or put it in a client-visible variable.
The claim at `README.md:191` that the frontend guide contains the full environment list is also stale because that guide omits these runner settings and the development-wallet settings.

### R3: token-generation command deletes literal letters

Priority P2.
The command at `README.md:105` uses two literal backslashes inside the single-quoted `tr` argument.
On this host, passing the exact documented argument to `tr -d` with the public fixture `banana` followed by a newline produced `baaa` followed by a newline.
It removes the letter `n` rather than the newline, which changes the random base64 token.
Shell command substitution already strips the trailing newline in this command.
Use `export AQUAMUX_AGENT_RUNNER_TOKEN="$(openssl rand -base64 32)"`, or correctly use a single backslash in the `tr` argument if that filter is retained.
The reproduction used a public fixture and generated or exposed no credential.

### R4: browser pause omits the surviving passive position

Priority P2.
`README.md:42-43` explains review lease expiry but never states that existing Aqua strategies can continue filling after Stop, browser closure, or heartbeat loss.
This distinction is explicit in the implementation plan and in `apps/frontend/lib/server/automation/liveness.ts`, whose pause message says that passive positions remain open.
`apps/frontend/lib/server/automation/lease.ts:4` sets the current lease timeout to 45 seconds.

State the current timeout, explain that Stop pauses management without docking existing strategies, and say that confirmed Close retires the selected positions.
For strategies with program expiry, qualify fillability by that expiry instead of implying that every position remains fillable indefinitely.
A pause also cannot cancel an already-submitted transaction.

### R5: fork failure status is stale

Priority P2.
`README.md:160` still presents the baseline fixture and range-schema failures as awaiting a verifier rerun.
`lifecycle-results.md:60-75` records the fixes and 13 passing fork checks.
`lifecycle-quality-review.md:64-72` independently records 13 passing checks on isolated port 19484 and identifies the fixture boundary.
Current `scripts/verify-fork.ts` resolves the Solidity fixture relative to the script and uses the corrected range object.

Replace the stale failure paragraph with dated, revision-specific fork evidence and link the lifecycle result and review.
Keep complete application E2E acceptance pending until the coordinator has its final evidence.
The fork's local wallet, token code, conversion router, and resolver credentials do not establish present live execution or public resolver discovery.
This reviewer checked the reports and corrected source but did not rerun the fork.

### R6: catalog coverage needs an explicit tradability distinction

Priority P2.
`README.md:29` describes curated entries but omits the implemented runtime registry and the distinction between listing and route validation.
The network section correctly says configuration does not prove execution, which should be retained.
`token-registry-results.md` and the registry modules separate `registryStatus: listed`, `routeStatus: not_checked`, on-chain metadata verification, risk state, and an amount-specific route result.

Describe the searchable runtime registry with its curated fallback, and state that a listed token is not proof of a usable funding route or executable Aqua strategy.
A successful quote is specific to its amount, direction, and observation time and needs refreshing for the intended operation.
Keep per-chain execution claims tied to their own evidence rather than catalog size.

## Claims and structure that should remain

The README correctly separates owner confirmation from model recommendations and keeps Privy delegation, directional MM, and Hedera charging disabled or deferred.
The shared-inventory explanation correctly states that sibling strategies depend on the same real maker inventory.
The configured network list matches the current Ethereum, Arbitrum, BNB Chain, and Robinhood Chain configuration.
The reviewed runtime policy uses non-root containers, drops capabilities, binds its bridge to loopback, and rejects host mounts and incompatible container identity or policy on resume.
The README appropriately calls this a local prototype rather than a production signing boundary.
No credential value appears in the reviewed README.

The file is short enough to remain a single overview with setup, workflow boundaries, and evidence links.
Further setup details belong in the frontend or runner guide once those guides are current; no additional document hierarchy is needed.
Its prose is concise, uses ASCII, and generally keeps each prose sentence on its own physical line.
The headings and bullets do not force artificial symmetry or use repetitive bold lead-ins.

## Verification and remaining acceptance

Read the implementation plan, applicable frontend AGENTS instructions, both package manifests, the example environment file, the frontend guide, runner entrypoint and runtime policy, managed runner configuration, transaction call sites, lease behavior, and relevant implementation and quality reports.
Verified that the working README matches the assigned commit, all relative README links resolve, and the README contains no non-ASCII characters.
Reproduced the exact `tr` argument using public input through a subprocess without invoking credential generation.
Compared every documented npm script name with its package manifest; all documented names exist, although `npm test` in the runner already includes `test:service` and the separate command repeats that suite.

No app process was started or stopped, dependencies were not installed, and no signing, provider inference, live API query, or browser test was performed.
The service and UI owners still have concurrent work and separate quality gates, so runtime spike success must not be promoted to full ReviewService or complete application acceptance.
The final reviewer should check the corrected setup sequence on the accepted revision, refresh current E2E and fork references, and verify that real-funds versus fixture labels remain accurate.
