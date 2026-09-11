# Baseline isolation quality review

Reviewed September 12, 2026.
Verdict: accept the B1 isolation repair in `9d0677850491cb145c9a4dfe993bececdfd77820` and its evidence in `e4193740870eaf5a9215f3cde065b9da14404a73`.
No must-fix finding remains within the documented local baseline workflow.
This acceptance does not certify production builds, live wallet execution, or unrelated concurrent implementation.

This independent reviewer owns only this report.
I read the implementation plan, frontend AGENTS instructions, B1 in `baseline-quality-review.md`, and `baseline-isolation-results.md`.
Both reviewed code files still match the implementation commit.
I made no source, dependency, generated-file, or existing dirty-file edits.

## Isolation and lifecycle findings

The launcher copies the current frontend source into a unique temporary directory before starting Next.js with that directory as its working directory.
The installed Next.js process therefore places its development lock and generated output outside the active checkout.
The loopback port probe rejects an occupied port before copying, and the explicit Next.js port remains a second bind-time check.
Playwright also refuses an existing server and gives each port a separate test-result directory.

I started the actual frontend through the launcher on port 52382, then ran the configured browser suite on 52383 and again on 52384 while the manual server remained running.
Both suites passed all nine tests.
The manual server returned HTTP 200 after each run.
The original server remained listening on 33127 with PID 24744 before and after verification.
I did not navigate, refresh, or operate the existing UI page.

SIGTERM to the owned manual launcher produced exit 0, removed its temporary source directory, and left all three review ports closed.
The installed Next.js CLI handles termination by waiting for its server child and has a forced-stop fallback.
The launcher waits for that CLI exit before removing the directory.
A separate disposable fixture verified SIGINT forwarding and cleanup, plus preservation of a child failure exit code of 7 with cleanup.
The fixture used the exact launcher and a small fake Next executable, so those latter checks verify launcher control flow rather than another real Next.js browser run.

The documented SIGKILL limitation is accurate.
There is no claim that this script can clean up after an uncatchable kill or host crash.
The launcher also depends on Next.js responding to termination; it is a local development utility rather than a general process supervisor.
These limits do not block B1 acceptance.

## Source, secrets, and portability

The actual temporary copy contained no top-level `.env*` files and linked node_modules to the installed frontend dependencies.
A disposable source fixture confirmed that `.env.local` and an unrelated runtime-output directory were excluded.
Changing a fixture source file after startup did not change its copied contents.
Next.js may adjust the copied TypeScript configuration without modifying the checkout's configuration.
Neither reviewed code file, `tsconfig.json`, nor `next-env.d.ts` had an uncommitted change after the review runs.

The copy allowlist operates on top-level names.
It is not a recursive secret detector, and inherited environment variables remain available to the child exactly as the correction report states.
I launched review processes with only PATH, HOME, optional TMPDIR, the telemetry opt-out, and the selected port.
No project environment file or credential value was read or printed by this review.
Do not reinterpret this development-copy boundary as an untrusted-code sandbox or a guarantee that arbitrary files placed under app, components, lib, or public are secret-free.

The copied source and dependency link support repeated local runs, not a standalone portable source archive.
The absolute dependency link needs the original installation, and copied source links would also need their targets.
The script uses POSIX path splitting consistent with the reviewed macOS workflow; Windows portability was not tested.
A new top-level runtime directory or configuration filename requires an allowlist update, as already documented.

The 85-entry digest manifest is useful for detecting source drift but cannot restore uncommitted content or lock the test source to the app copy.
At review time, 70 listed files matched, 15 differed, and none were missing.
Concurrent implementation therefore prevents treating this rerun as a byte-identical replay of the earlier screenshot and test run.
The new passing results establish repeatability of the corrected startup workflow with the current overlay.
The existing report already discloses the reconstruction limit, so it is not a new acceptance blocker.
Preserving a sanitized source archive and test-file digests would be appropriate if exact historical replay becomes a requirement.

## Validation evidence

The review used Node.js 22.23.2 with installed Next.js 16.3.4 and Playwright 1.63.0.
All browser runs used the actual existing nine-test suite and its fixture boundaries.

| Check | Observed result |
| --- | --- |
| Actual manual server on 52382 | HTTP 200 before and after both browser runs. |
| Browser suite on 52383 | Nine passed in 13.4 seconds, exit 0. |
| Browser suite on 52384 | Nine passed in 12.7 seconds, exit 0. |
| Direct launcher collision on 52382 | EADDRINUSE, exit 1. |
| Playwright collision with owned HTTP fixture on 53079 | Existing URL refused, exit 1. |
| Empty, 1023, 65536, 1.5, and abc launcher port values | Validation error, exit 1 for each. |
| Actual manual launcher SIGTERM | Exit 0 and its temporary directory removed. |
| Review ports after shutdown | 52382, 52383, and 52384 closed. |
| Disposable fixture SIGINT | Exit 0 and temporary directory removed. |
| Disposable fixture child exit 7 | Exit 7 preserved and temporary directory removed. |
| ESLint for both reviewed code files | Exit 0 with zero warnings. |
| Prettier check for both reviewed code files | Exit 0. |
| Active original server | PID 24744 still listening on 33127. |

To repeat the real workflow, select three currently free nondefault ports and run the following from `apps/frontend`.
Keep the first command in its own terminal while running the two test commands sequentially in another terminal.
Stop only that owned manual launcher afterward.

```sh
AQUAMUX_DEV_PORT=52382 node scripts/baseline-dev.mjs
AQUAMUX_DEV_PORT=52383 node node_modules/@playwright/test/cli.js test --config playwright.baseline.config.ts
AQUAMUX_DEV_PORT=52384 node node_modules/@playwright/test/cli.js test --config playwright.baseline.config.ts
```

The raw review logs remain local at `/var/folders/x3/4w6qlmgx7ss4zsvzcjq7592m0000gn/T/aquamux-isolation-review-3tk5c6o4` and are not durable repository artifacts.
The result table above preserves the relevant outcomes in this report.

## Code quality and acceptance

The 79-line launcher and 28-line Playwright configuration have distinct, focused responsibilities.
The launcher owns temporary source preparation and process lifecycle; the configuration owns browser settings and Playwright server integration.
Their ESM imports, quoting, formatting, and explicit error handling fit the repository conventions.
Splitting this small launcher further would add indirection without an observed maintenance benefit.
The duplicated short port validation keeps the standalone launcher safe and does not warrant a shared module at this size.

Accept B1 with its existing local-development and source-reconstruction limitations.
No implementation refactor is required for this repair.
The coordinator can use this report as the mandatory independent code-quality acceptance evidence for these two commits.
