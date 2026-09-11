# Runtime repair quality review

Reviewed September 12, 2026.
The reviewed commit is `cfe489e69d6e98ce96e9bf044587195a5be692f6`.
Source line references refer to that commit.
This independent review owns only this report and makes no runtime implementation changes.

## Verdict

Changes required before integration acceptance.
All 13 committed runtime tests pass with real Docker enabled, and the literal original R1 and R3 reproductions are now rejected or cleaned up correctly.
Additional real Docker regressions show that R1 and R3 are not fully resolved.
A detached descendant survives both normal parent completion and explicit cancellation, and resume accepts a container with disabled seccomp and the host UTS namespace.
R2's bounded Docker control and acquisition cleanup requirements and R4's closed evidence requirements pass the checks described below.

| Original finding | Result |
| --- | --- |
| R1: Descendant cleanup | Still requires repair for descendants that create a separate process group. |
| R2: Docker deadlines and acquisition cleanup | Accepted for the original Docker control scope, including a real partial-acquisition cleanup check. |
| R3: Resume isolation policy | Still requires repair for additional security options and namespace modes. |
| R4: Arbitrary provider content in evidence | Accepted for the reviewed spike evidence paths and synthetic secret checks. |

## Must-fix findings

### R1: Detached descendants escape the supervisor

Priority P1.
Locations: `apps/agent-runner/src/process-supervisor.mjs:21-30`, `:35-36`, and `:47-53`.
The supervisor kills only the shell's process group.
A child can start its own session and process group through ordinary Node `spawn` with `detached: true`.
The parent supervisor then reports completion and deletes its PID file, while the detached child continues running.
The completed handle's `kill()` returns immediately.
Cancellation also kills only the original process group and reports an AbortError without removing the detached child.

The following harmless script was written to `/tmp/detach.cjs` inside a newly created sandbox through `writeTextFile`.
The review ran `node /tmp/detach.cjs` through the public `spawn` interface, drained stdout and stderr, awaited `wait()`, and called `kill()`.
After 1500 milliseconds, `test -e /tmp/review-detached` returned zero.
The parent exited zero and emitted no stdout or stderr.

```js
const { spawn } = require('node:child_process');
spawn(process.execPath, [
  '-e',
  'setTimeout(() => require("fs").writeFileSync("/tmp/review-detached", "escaped"), 1200)',
], { detached: true, stdio: 'ignore' }).unref();
```

A second reproduction used the same detached-child pattern with a 1500-millisecond delayed write and kept the parent alive with `setInterval(() => {}, 1000)`.
The review aborted the handle 500 milliseconds after spawn.
`wait()` rejected with AbortError, but the detached child still created `/tmp/review-detached-abort` afterward.
This second reproduction imported the transport directly from an extraction of the reviewed commit.
Both owned containers were destroyed afterward, and Docker inspection confirmed removal after the cancellation check.

Required repair: supervise the complete command lifetime, including descendants that change process groups, or retire the entire owned sandbox when command cleanup cannot be proven.
If interruption retires the container, subsequent reviews must acquire a new sandbox and treat prior resumability as lost.
Session retirement alone does not remove these processes because the spike supplies an externally owned sandbox and reuses it across new sessions.
Add real Docker regressions for both normal completion and cancellation of detached descendants.
Keep the existing background-shell and immediate-abort tests.

### R3: Resume permits weaker security and namespace settings

Priority P2 for the private prototype, required before integration acceptance.
Locations: `apps/agent-runner/src/container-policy.mjs:22` and `:28-29`.
The security check requires that `SecurityOpt` contains `no-new-privileges`, but permits additional options that disable another restriction.
The namespace check covers network, PID, and IPC modes but does not inspect `UTSMode`.

The review constructed a fresh identity with a random name and owner and the actual immutable spike image ID.
It created a container using `containerArguments(identity.id, identity.imageId, identity.owner)` with these two additional Docker options:

```text
--security-opt=seccomp=unconfined
--uts=host
```

`createDockerSandbox({ identity })` accepted the container.
Inspection showed `SecurityOpt: ["seccomp=unconfined", "no-new-privileges"]` and `UTSMode: "host"`.
The test container was removed immediately afterward.
This demonstrates policy acceptance of a weaker configuration, not remote control of the Docker daemon or a demonstrated host escape.

Required repair: define and validate the supported effective security options and all relevant namespace modes together with creation policy.
Reject unapproved options instead of accepting any superset containing the required flag.
Add separate negative tests for disabled seccomp and host UTS mode, plus the other namespace settings supported by the chosen Docker engine.
Keep the existing negative tests for capabilities, privilege, resource limits, mounts, ports, running state, owner, and image mismatch.

The persisted identity now binds the expected name, random owner label, and immutable image ID.
It does not record Docker's immutable container `Id`.
Record and compare that ID if the intended guarantee is resuming the exact container instance rather than an instance with matching name, labels, and image.
The current report must not claim stronger identity verification than the implementation performs.

## Passed repairs and remaining boundaries

### Docker deadlines and acquisition cleanup

`docker-command.mjs` gives control operations a default 15-second deadline, cancellation, a stdout limit, closed errors, and discarded stderr.
Creation uses a 30-second operation budget and cleanup uses its own 10-second budget without the cancelled acquisition signal.
The process-kill control path has a 5-second budget and a separate 5-second whole-container fallback.
The controlled hung subprocess test rejected after approximately 53 milliseconds with a configured 50-millisecond deadline in the exact-commit rerun.
The cancellation test passed without copying its synthetic stderr secret into the error.

`acquireContainer` records intended ownership before `docker run` and attempts removal for failures in run, workspace setup, and inspection.
The controlled tests exercise each branch and explicitly classify cleanup failure.
An additional check used the real Docker executor for image inspection, container creation, and removal, while deliberately failing the workspace setup call.
Acquisition rejected with the synthetic failure, and subsequent Docker inspection confirmed that the created container no longer existed.
No shared daemon outage was induced.

`boundedCleanup` records runtime and container outcomes separately and the spike exits unsuccessfully when either is unconfirmed.
The timeout of a cleanup promise cannot itself prove that the underlying operation stopped; the explicit unconfirmed result preserves that distinction.
The intermediate spike `session.stop()` and `session.destroy()` calls remain direct awaits outside this helper.
This review does not establish a universal wall-clock bound for arbitrary upstream lifecycle hangs.

### Evidence and authentication

`spike-evidence.mjs` selects known error codes, event names, finite nonnegative numbers, fixed check results, and diagnostic counts.
Arbitrary error messages, unknown event keys, model text, structured model values, and extra usage fields do not enter turn evidence.
Synthetic tests passed for query-string tokens, environment-shaped values, unknown token formats, console warnings, console errors, and direct stderr writes.
The spike's explicit console messages are fixed strings and final evidence uses the selected fields.
No real credentials were read or printed during this review.

The factory rejects the tested API-key and Gateway environment overrides before creating either adapter, including when imported outside the spike entry point.
This does not independently prove every native auth-store configuration selects a subscription credential.
The provider compatibility measurements in `runtime-spike-results.md` remain the runtime worker's evidence; this review did not rerun model inference or inspect private lifecycle state.
No inference charges were incurred by this review.

### Cancellation and session retirement

The exact original background-shell reproduction now passes, as do foreground cancellation and immediate startup cancellation.
The spike retires the interrupted harness session before creating its recovery session.
This addresses the documented late abort-frame reuse behavior at the session level.
The surviving detached processes above show why session replacement cannot substitute for container cleanup.
The persisted resume marker and atomic state rename are useful recovery checks, but this review does not establish recovery after container loss or host failure.

## Code quality and ownership

The repair's module split is appropriate.
`docker-command.mjs` owns bounded Docker control, `process-supervisor.mjs` owns command lifetime, `container-policy.mjs` keeps construction and validation together, and `docker-sandbox.mjs` implements the sandbox contract.
`spike-evidence.mjs` centralizes evidence selection and cleanup outcomes.
The files remain focused and fit the existing ESM conventions.
The remaining fixes belong in these modules; no broader architecture rewrite is necessary.
Expand dense nested lifecycle handlers when repairing them so cleanup ordering and error propagation stay reviewable.

This review read the implementation plan and original `runtime-quality-review.md`.
No applicable repository AGENTS.md exists for `apps/agent-runner` or this report directory; the supplied common instructions apply.
The frontend-specific AGENTS.md is outside the reviewed paths.
Concurrent service, package, and frontend changes were excluded and preserved.
A concurrent JSDoc-only change to `runtime.mjs` prompted an additional complete test run against extracted commit files.
No generated files or CHANGELOG files were modified.

## Verification and handoff

Executed `RUN_DOCKER_TESTS=1 node --test test/*.test.mjs` in `apps/agent-runner`.
All 13 tests passed with zero skips.
Then extracted every committed runtime `.mjs` source and test from `cfe489e` into a temporary directory and reran the suite against those files, using the installed pinned SDK dependencies through a node_modules link.
All 13 tests passed again with zero skips in approximately 5.53 seconds.
The review did not modify or reinstall dependencies.

Additional real Docker checks covered detached-child normal completion, detached-child cancellation, weaker resume configuration, and partial-acquisition cleanup.
The first three demonstrated the must-fix findings above; partial-acquisition cleanup passed.
All containers created by these checks were removed.
The controlled failure tests did not stop or reconfigure the shared Docker daemon.
No frontend or separately owned service validation is claimed.

Runtime implementation ownership remains with the coordinator's runtime repair worker.
This review owns `references/ethglobal-competitive-analysis/runtime-repair-quality-review.md` only.
Route R1 and R3 back for repair and request independent review of the resulting commit and new regressions before accepting runtime integration.
