# Baseline server isolation correction

Verified September 12, 2026.
Implementation commit is `9d06778`.
This deliverable addresses B1 in `baseline-quality-review.md` and requires a separate code-quality reviewer before acceptance.

## Ownership and behavior

The implementation owns `apps/frontend/playwright.baseline.config.ts` and `apps/frontend/scripts/baseline-dev.mjs`.
The configuration keeps Playwright settings and port-specific result directories together.
The 79-line launcher owns port refusal, temporary source copying, server startup, signal forwarding, and cleanup.
No frontend feature, backend, dependency, Next configuration, generated file, or existing dirty file was edited by this worker.
The documentation changes belong to this worker's baseline evidence.

Each invocation creates a temporary directory and copies the current app, components, library, public assets, and explicit build configuration files.
It links the installed node_modules read-only by convention; do not install dependencies while tests run.
Next writes its lock, generated types, and configuration adjustments inside that copy.
The process forwards SIGINT and SIGTERM to its server and removes its temporary directory after the server exits.
SIGKILL cannot run cleanup, so an abruptly killed run can leave a temporary directory.

The copy deliberately excludes project environment files.
Environment variables explicitly exported in the launching shell remain available to the child; the launcher does not log their values.
API-backed checks therefore need their intended configuration exported before launch.
The browser tests here use synthetic wallet and endpoint fixtures and do not prove live API or wallet behavior.
The copy is a start-time source view, so restart it to pick up later edits and avoid changing source files during its brief copy operation.
This is a repeatable testing and inspection server, not the live-edit HMR server.
Add new top-level runtime directories or build configuration files to the explicit copy list if the app begins using them.

Run from `apps/frontend`, choosing free nondefault ports:

```sh
AQUAMUX_DEV_PORT=33264 node scripts/baseline-dev.mjs
```

In a second terminal:

```sh
AQUAMUX_DEV_PORT=33265 npx playwright test --config playwright.baseline.config.ts
```

Stop the manual server with Ctrl-C after inspection.
Tests refuse an occupied port instead of adopting another worker's listener.
The existing server at 33127 can remain running throughout both commands.

## Reproduction and validation

Before implementation, a disposable minimal Next app using the installed dependencies served HTTP 200 on port 33261.
Starting the same app on 33262 exited 1 with `Another next dev server is already running`.
The first listener still returned HTTP 200 afterward.
Only the disposable processes were stopped.
This matches the independent review's end-user development workflow reproduction.

| Check | Result |
| --- | --- |
| ESLint on both owned code files | Exit 0, zero warnings. |
| Prettier on both owned code files | Formatted successfully; final check passed. |
| First full browser run on 33263 with original 33127 listener active | Nine passed in 13.5 seconds, exit 0. |
| Repeated full browser run on 33265 with isolated manual server 33264 and original 33127 active | Nine passed in 13.0 seconds, exit 0. |
| Direct launcher on occupied 33264 | EADDRINUSE, exit 1. |
| Playwright on occupied 33264 | Refused existing URL, exit 1. |
| Orca page for 33264 | Loaded the actual app; snapshot and screenshot succeeded. |
| Owned process cleanup | Ports 33264, 33265, and 33266 had no listeners after shutdown; the manual temporary source directory was removed. |
| Original listener | PID 24744 continued listening on 33127 throughout verification. |

The original UI-owned Orca page was not navigated, refreshed, or inspected.
Manual verification used a new page bound explicitly by page ID.
The screenshot shows the disconnected swap interface with loaded token artwork and aligned controls; no new visual defect was observed.

Evidence includes [the repeated browser log](baseline-evidence/b1-e2e.log), [collision refusal](baseline-evidence/b1-collision.log), [Orca screenshot](baseline-evidence/b1-orca.png), and [source digests](baseline-evidence/b1-source-sha256.txt).
The digest manifest records the manual server's source copy, including the then-current dirty overlay, without committing another author's source.
It can detect differences but cannot reconstruct uncommitted source.
The installed Playwright package was 1.63.0 and Next was 16.3.4.

## Turbopack font investigation

The current source did not reproduce the earlier Geist URL error in a fresh disposable build.
A source copy under the frontend's ignored `.next` directory used the same dependencies and an explicit Turbopack root pointing to the frontend to accommodate the linked node_modules.
The default Turbopack bundler served `/` with HTTP 200 on 33266 after a 4.6-second first compilation.
A separate Orca page loaded the app, reported `document.fonts.check` true for Geist Variable, and had no console messages.
No font, dependency, or production configuration change is justified by this result.
This does not certify the existing checkout's old cache or production build, and does not establish the historical error's cause.
The corrected baseline retains its explicit Webpack behavior.

## Review handoff

The coordinator should dispatch an independent reviewer for the launcher lifecycle, copy boundaries, configuration conventions, and maintainability before accepting B1.
Review should repeat the two-port workflow and occupied-port refusal and confirm temporary cleanup.
Any required refactor belongs in a focused follow-up commit.
