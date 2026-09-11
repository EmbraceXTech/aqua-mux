# Development baseline results

Checked September 12, 2026 in `/Users/sainytk/Documents/projects/personal/aqua-mux`.
The starting revision was `427a4ec8dd063bcbbbaef870b20ec7a709b119a5` on `main`, with the existing pair-chart edits listed below.
The complete implementation plan and frontend AGENTS instructions were read before the baseline work.

## Result

The current frontend passes 15 unit tests, TypeScript checking, ESLint and all nine existing browser tests when served with Webpack.
The browser suite completed in 13.6 seconds with five workers.
The normal fork verification command fails first on a fixture path, then reproduces the requested range-schema mismatch after a temporary environment-only symlink.
No product feature or verifier fix was implemented in this task.
No live transaction was submitted and no credential value was printed.

| Check | Result | Evidence |
| --- | --- | --- |
| `npm install` | Completed; changed two installed packages; audited 411 packages; zero reported vulnerabilities; no tracked lockfile change. | Local `/tmp/aquamux-phase0-install.log`. |
| `npm test` | 15 passed, zero failed. | [Unit log](baseline-evidence/unit.log). |
| `npm run typecheck` | Passed. | [Typecheck log](baseline-evidence/typecheck.log). |
| `npm run lint` | Passed with zero warnings. | [Lint log](baseline-evidence/lint.log). |
| `npx playwright test --config playwright.baseline.config.ts` | Nine passed on port 33127 with Webpack. | [Browser log](baseline-evidence/e2e-webpack.log). |
| Default Turbopack startup | Failed to compile Geist font URLs and timed out before browser tests. | Local `/tmp/aquamux-phase0-e2e.log`; exact error below. |
| `AQUAMUX_TEST_PORT=19547 npm run verify:fork` | Failed on missing relative Solidity fixture. | [Initial fork log](baseline-evidence/fork.log). |
| Same fork command with temporary fixture symlink | Failed at `range` with `invalid_union`, expected object but received number. | [Range mismatch log](baseline-evidence/fork-range.log). |
| Orca browser | Navigation, snapshot, LP click and screenshot succeeded against the persistent server. | [Desktop](baseline-evidence/orca-desktop.png), [LP](baseline-evidence/orca-lp.png). |

The browser wallet tests inject an EIP-1193 fixture and intercept the plan endpoint.
They prove the UI requests an atomic batch and waits for status, not that an actual wallet supports the batch on a live chain.
Chart tests intercept chart data and therefore do not establish market data freshness.
Manual Orca navigation used the actual local application without those intercepts.

## Development environment and browser loop

Installed versions include Node.js `22.23.2`, npm `10.9.8`, Next.js `16.3.4`, React `19.2.8`, Aqua SDK `0.3.1` and SwapVM SDK `0.4.1`.
The local Next.js CLI guide was read from `node_modules/next/dist/docs/01-app/03-api-reference/06-cli/next.md`.

The new `apps/frontend/playwright.baseline.config.ts` uses `AQUAMUX_DEV_PORT`, defaulting to 33128, and rejects invalid ports.
It explicitly binds to `127.0.0.1`, disables existing-server reuse and retains failure screenshots and traces.
An occupied port causes failure rather than silently testing another process.
The existing Playwright configuration and package scripts remain untouched.
Do not merge configurations with two `webServer` entries, because Playwright can start both servers.

Run from `apps/frontend`:

```sh
npm ci
AQUAMUX_DEV_PORT=33128 npx playwright test --config playwright.baseline.config.ts
npx next dev --webpack --hostname 127.0.0.1 --port 33127
```

Check availability before selecting a port.
Use a distinct free port for tests while the persistent dev server is running.
The corrected baseline launcher copies frontend source into a temporary directory, so each server owns a separate Next build directory and generated files.
See [B1 correction evidence](baseline-isolation-results.md) for parallel startup, collision rejection, environment handling, and review status.
The test process owns and shuts down its server; do not rely on that short-lived server for subsequent manual browser work.

The persistent server runs in Orca terminal `term_39794535-9977-4304-bfef-40a9aa32ab67` at `http://127.0.0.1:33127`.
The browser page ID is `c95d3318-bbd2-4be3-90d6-fad9f99dd580`.
These handles are session-specific and should be re-listed if Orca restarts.

```sh
orca terminal read --terminal term_39794535-9977-4304-bfef-40a9aa32ab67 --json
orca goto --page c95d3318-bbd2-4be3-90d6-fad9f99dd580 --url http://127.0.0.1:33127 --json
orca snapshot --page c95d3318-bbd2-4be3-90d6-fad9f99dd580 --json
orca screenshot --page c95d3318-bbd2-4be3-90d6-fad9f99dd580 --json
```

Use references from a fresh snapshot for clicks and snapshot again after interaction.
Orca screenshot JSON contains base64 data; save and decode it locally rather than printing the full payload into agent context.
An initial screenshot attempt against a stopped test server timed out; the persistent server resolved that feedback-loop problem.

## Reproduced failures

The first invocation uses the repository's documented npm entrypoint without modifying code:

```text
> aquamux@0.1.0 verify:fork
> tsx scripts/verify-fork.ts
ENOENT: no such file or directory, open 'contracts/TestWallet.sol'
```

The actual fixture is `apps/contracts/TestWallet.sol`.
The verifier reads `contracts/TestWallet.sol` relative to the frontend working directory.
A temporary `apps/frontend/contracts` symlink to `../contracts` allowed the same npm command to continue.
The symlink was removed immediately after the run.
No source fixture, verifier code or generated verification result was edited.

The second run failed with the following schema evidence:

```text
code: invalid_union
path: ["range"]
Invalid input: expected "full"
Invalid input: expected object, received number
```

`scripts/verify-fork.ts:192` supplies `range: 20` to `buildPlan`.
The current `lib/model.ts` validates either `"full"` or `{ minPct, maxPct }`.
The later verifier worker should use the equivalent explicit bounds and fix fixture resolution relative to the script location, then rerun the full command.
Do not report the remaining verifier checks as passed until that run completes.
The run reached the fork setup, contract reads and local fixture deployment before schema rejection, but did not complete strategy registration or fill verification.
Anvil uses an isolated local chain at port 19547 and the script terminates it in `finally`.

Default Turbopack startup reported:

```text
./app/globals.css:27:8
Error: Module not found: Can't resolve './files/geist-vietnamese-wght-normal.woff2'
```

The log also contains other Geist subset resolution failures.
Webpack served the same application successfully without modifying layout imports, global styles or installed package contents.
This establishes a working local baseline, not a root-cause fix or proof of production build behavior.
The environment/build owner should reproduce and resolve default bundler behavior before deployment.

## Visual baseline

The desktop screenshot shows the current AquaMux blue network mark, pale background, basket builder and allocation preview.
The LP screenshot records the pair selection and range panel in the actual app.
The existing chart tests produced [desktop chart](baseline-evidence/chart-desktop.png) and [mobile chart](baseline-evidence/chart-mobile.png) screenshots.
The desktop app and mobile chart screenshots were visually inspected; the tested mobile layout has no horizontal document overflow and visible token images load.
The mobile chart keeps unavailable volume explicit and retains the opening-price disclaimer.
The current UI still exposes Portfolio navigation and has no managed strategy catalog, durable bot workspace or lifecycle controls.
Those are implementation work governed by the runtime gate, not regressions to hide in the baseline.

## Secrets and authorization

Only variable names were inspected in the existing frontend `.env` and process environment.
The file contains `ETHEREUM_RPC_URL`, `ARBITRUM_RPC_URL`, `BASE_RPC_URL`, `BNB_RPC_URL`, `ROBINHOOD_RPC_URL`, `THE_GRAPH_API_KEY`, `AQUA_SUBGRAPH_URL`, `ONEINCH_API_KEY` and `PRIVATE_KEY`.
No Privy variable names were present in the checked local env files.
Presence of a variable name does not prove its credential is valid or its integration is configured correctly.
The authorized private key must remain outside the agent runner environment.
One later transaction executor must serialize all real chain writes and coordinate nonces.

## Preserved starting edits

The nine pre-existing tracked modifications are:

```text
apps/frontend/app/globals.css
apps/frontend/components/aquamux.tsx
apps/frontend/e2e/app.spec.ts
apps/frontend/lib/config.ts
apps/frontend/lib/model.ts
apps/frontend/lib/server/plan.ts
apps/frontend/lib/strategy.ts
apps/frontend/test/model.test.ts
apps/frontend/test/plan-router.test.ts
```

The pre-existing untracked inputs are:

```text
.DS_Store
apps/frontend/app/api/chart/route.ts
apps/frontend/components/price-range-chart.tsx
apps/frontend/e2e/price-range.spec.ts
apps/frontend/lib/price-range.ts
apps/frontend/lib/server/charts.ts
apps/frontend/public/networks/4663-robinhood-chain.png
apps/frontend/test/charts.test.ts
```

The initial status and binary tracked diff were saved locally as `/tmp/aquamux-phase0-initial-status.txt` and `/tmp/aquamux-phase0-initial-tracked.patch` before installation.
Those are local recovery aids and are not committed as another author's work.
The original tracked diff remains unchanged by this task.
Concurrent runtime-worker files under `apps/agent-runner/` were left alone.
The root ignores `references`, so only this worker's requested reports and evidence are explicitly added when committing.
The [implementation task map](implementation-task-map.md) specifies how to retain the dirty overlay when creating parallel Orca branches.

## Remaining work

The coordinator must evaluate the separate runtime and compatibility spike reports before opening product implementation.
The fork fixture path and schema fixes remain assigned to the later verifier task as requested.
Production build behavior, real wallet compatibility, delegated policies, complete LP lifecycle, browser leases, MM instruction support and paid Hedera reviews are not certified by this baseline.
