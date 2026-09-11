# Baseline and compatibility quality review

Reviewed September 12, 2026.
The baseline review covers commits `c5816f8340745629ecc1094dbe317c62cc6802a1` and `6e0ea79bdd0d43dfd730b80f57de7e134de3f021`.
The coordinator also assigned the report-only compatibility deliverable at `660209f7eacbb74c5f371fe967d84bdc9d69a034`.
This worker owns only this report and made no product, test, configuration, generated-file, or evidence-file edits.
The implementation plan and applicable frontend AGENTS instructions informed the review.

## Baseline verdict

Changes requested for one reproducible development-workflow defect.
The recorded nine-test browser result remains credible for a run before the persistent server started.
The defect affects repeating that run while the documented persistent server remains active.

### B1: Separate ports do not isolate Next.js development servers

Priority P1 for the promised repeatable browser loop.
Evidence is `apps/frontend/playwright.baseline.config.ts:20-24` and `dev-baseline-results.md:45-55`.
The configuration always launches another `next dev` in the same frontend directory and prohibits existing-server reuse.
The report directs workers to leave the persistent server running and choose a different test port.
Both processes still use `.next/dev`, so the second server fails to acquire the development lock before tests can run.

The installed Next.js source confirms the mechanism.
`node_modules/next/dist/server/config-shared.js:278` enables `lockDistDir` by default.
`node_modules/next/dist/server/config.js:1245-1249` appends `dev` to the configured build directory.
`node_modules/next/dist/server/lib/router-utils/setup-dev-bundler.js:143-162` acquires that directory's `lock`, independently of the TCP port.
The frontend's `next.config.ts:2` supplies no alternative build directory.

I reproduced the documented two-server pattern in a disposable minimal Next.js app using the installed package and a copy of the frontend configuration.
The temporary app had a minimal layout and page, a private package manifest, and a symlink to the existing node_modules.
It received only PATH, HOME, TMPDIR, and the telemetry opt-out variable, with no project environment file.
The first Webpack dev server became ready on free port 64986.
The second Webpack dev server used free port 64987 and exited with status 1:

```text
Another next dev server is already running.
Local: http://127.0.0.1:64986
```

Only these temporary processes were stopped, and the temporary app was removed.
The active Orca browser and development server were not operated or interrupted.

The baseline owner should make the documented workflow executable before acceptance.
For simultaneous manual browsing and automated tests, give the test server its own build directory or isolated checkout and verify that the two processes remain usable together.
A deliberately sequential workflow is also valid if the report explicitly requires the server owner to stop the persistent server before tests and restart it afterward.
Do not disable the development lock or blindly reuse an arbitrary listener to hide the collision.
Acceptance should include a repeated nine-test run through the corrected workflow and evidence that the manual browser server remains usable or is explicitly restarted.

## Baseline quality assessment

The 26-line configuration is a focused module with no reason to split it further.
It follows the existing TypeScript, quoting, and Playwright conventions.
Port validation prevents malformed values from entering the shell command, loopback binding limits exposure, and refusing unrelated server reuse is a sound default.
Keeping the temporary Webpack baseline separate from the original configuration avoids absorbing the existing dirty test changes.
Its role as a temporary baseline should remain explicit when the default Turbopack failure is resolved.

The six committed logs support the documented unit-test counts, browser-test counts, and two fork failure messages.
The lint and typecheck logs show invocation output only; they do not independently encode exit status.
The report accurately distinguishes wallet transport fixtures, chart fixtures, registration, live fills, and unavailable lifecycle verification.
No baseline test was added, and the reviewed existing browser assertions match those narrow claims.
The report correctly leaves the failed fork verifier and production build uncertified.

I visually inspected all four PNGs.
They contain the disconnected app and chart controls, with no visible credential, signing request, private account details, or secret-bearing URL.
The chart screenshots contain synthetic data, which the report discloses.
The desktop captures are viewport images and should not be treated as full-page or complete mobile-flow evidence.
A credential-pattern scan of all six logs and the three reviewed reports returned zero matches, and manual inspection found no exposed credential values.
This finding covers the committed artifacts, not the contents of uninspected environment files.

The implementation task map assigns focused modules and separates planning, execution, observation, and interface integration.
Its dirty-overlay procedure and narrow staging rules preserve other workers' work.
Before using the map for subsequent dispatches, the coordinator should explicitly attach the user's mandatory independent code-quality review gate to every implementation deliverable.
The map currently describes coordinator review at line 15 but does not record the separate reviewer and required-refactor gate.

For stronger reproducibility, add a non-secret digest manifest for the actual dirty source overlay and the browser package version.
The report identifies the original revision and dirty paths, but `dev-baseline-results.md:162-163` retains recovery artifacts only under local `/tmp` paths.
A future reader cannot reconstruct the exact tested source from the two baseline commits alone.
This limitation is disclosed and does not justify committing another author's edits.
Prefer `npm ci` for a locked reproduction, and record exit codes when capturing future check logs.

## Compatibility report verdict

Accepted as a report-only compatibility investigation, with no must-fix finding.
This verdict accepts its conservative gate decisions and proposed boundaries, not deployed MM support, Privy integration, or complete live execution proof.
The report explicitly keeps both features disabled and distinguishes provider documentation from authenticated tests.

I independently regenerated all five SDK-builder encodings listed at `delegation-mm-spike-results.md:90-94` with the installed packages and the `tsx` loader.
XYC, expired deadline, future deadline, credential guard, and regular LimitSwap bytes all matched the report exactly.
The installed AquaProgramBuilder has no `limitSwap1D` method, while RegularProgramBuilder does.
The current vendored Aqua opcode dispatcher excludes LimitSwap, and the two vendored repository revisions match the report.
The Aqua interface declares the four cited events without indexed fields, and its implementation keys docking by `msg.sender`.
These checks support the instruction-family distinction, observer guidance, and same-maker owner-recovery requirement.

I rechecked the primary [Privy policy reference](https://docs.privy.io/controls/policies/overview), [batch recipe](https://docs.privy.io/recipes/batch-transactions), and [signer removal documentation](https://docs.privy.io/wallets/using-wallets/signers/remove-signers).
They support the report's documented batch and signer-management capabilities, including the warning that simulation can fail before policy evaluation.
They do not establish AquaMux's authenticated nested-call policy behavior.
The report correctly requires separate allowed, forbidden, expired, revoked, and owner-recovery tests.

The proposed dedicated MM app has explicit deterministic quote arithmetic, independent directional hashes, bounded inventory, and owner-controlled retirement.
The signing boundary remains separate from model execution.
These are appropriate module boundaries for later design review; no implementation is present to assess for component size or internal coupling.
Deployments and provider capability flags must remain gated as the report requires.

For the next compatibility iteration, preserve an executable read-only probe and sanitized structured output rather than only reconstruction instructions at lines 101-120.
Record exact order fields, compiled fixture runtime or digest, block hash, full call parameters excluding RPC credentials, and decoded results.
The report explicitly uses `latest` after its snapshots, so the listed snapshot hashes cannot certify the precise runtime state of every probe.
I did not rerun the four-chain RPC experiments, receipt reads, or credential inventory, and do not independently certify those measurements.
Those limitations do not undermine the decision to leave unsupported features disabled.

## Review validation and routing

| Check performed | Result |
| --- | --- |
| Baseline config compared with its submitted commit | No intervening change. |
| Baseline reports and evidence compared with their submitted commit | No intervening change. |
| `playwright test --config playwright.baseline.config.ts --list` | Nine tests in two files discovered without starting a browser or server. |
| `eslint playwright.baseline.config.ts --max-warnings=0` | Passed. |
| `prettier --check playwright.baseline.config.ts` | Passed. |
| Config imports for ports 1024, 65535, and 33128 | Accepted. |
| Config imports for empty, 1023, 65536, 1.5, and abc values | Rejected. |
| Isolated two-port Next.js reproduction | First server ready; second exited 1 due to shared build-directory lock. |
| SDK program encodings | All five matched the compatibility report. |
| Evidence inspection | Six logs and four screenshots inspected; no exposed credentials found. |

The full app browser suite, fork verifier, and live-chain operations were not rerun during this review.
Route B1 to the baseline owner, then obtain independent verification of the corrected workflow before accepting that deliverable.
The compatibility report can be accepted now with its existing closed feature gates.
This review commit should contain only `references/ethglobal-competitive-analysis/baseline-quality-review.md`.
