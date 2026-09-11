# Runtime final quality review

Reviewed September 12, 2026, Asia/Bangkok.
This independent review owns only this report and makes no implementation changes.

## Verdict

Accept the reviewed runtime code for the private prototype.
No required code changes remain in the R1 through R4 scope of `runtime-repair-quality-review.md`.
The exact original detached Node reproductions now pass when normal completion is followed by handle cleanup and when the running command is cancelled.
The requested 14 tests pass against extracted commit files with real Docker enabled, and all 16 tests pass after adding the durable acquisition callback commit.
Twelve additional real Docker cases pass.
This verdict does not approve separately owned service code or claim a fresh model compatibility matrix.

| Finding | Verdict | Evidence |
| --- | --- | --- |
| R1: Escaped descendants | Accepted with whole-container retirement as the cleanup boundary. | Exact detached Node completion followed by `kill()`, detached cancellation, existing shell-background and immediate-abort regressions pass. |
| R2: Control deadlines and acquisition cleanup | Retained and accepted. | Controlled deadlines, cancellation, cleanup-failure cases, and an injected workspace-setup failure using real Docker pass. |
| R3: Resume isolation and identity | Accepted. | Exact security-option validation, namespace rejection, and rejection of a replacement container with matching name, owner, and image pass. |
| R4: Closed evidence | Retained and accepted. | Synthetic arbitrary-content, diagnostic suppression, authentication override, and cleanup outcome tests pass. |

## Exact code scope

The primary reviewed commit is `88f4ca55e596918024e8821e9074d4e483f470fd`.
It includes the runtime factory annotation commit `f305955b93354f4adf11ff2220639431b49b5dd8` in its ancestry.
The coordinator subsequently added `d0401aafa7a6e8b82a0d2461a71d172942685621` to scope for acquisition registration and option annotations.

Reviewed implementation files under `apps/agent-runner`:

- `src/process-supervisor.mjs` and `src/docker-sandbox.mjs` implement process execution, container retirement, and the sandbox interface.
- `src/container-policy.mjs` defines container construction, validation, identity, and acquisition.
- `src/docker-command.mjs` implements bounded Docker control.
- `src/runtime.mjs` defines the runtime factory, schema fixture, and environment refusal.
- `src/spike-evidence.mjs` selects evidence and cleanup outcomes.
- `spike/adapters.mjs` implements the graceful restart and interrupted-review matrix flows.
- The five `test/*.test.mjs` files supply the 14-test baseline and 16-test callback extension.

The review extracted committed `.mjs` files into a temporary directory and linked the installed dependencies without reinstalling or modifying them.
The 14-test run used `88f4ca5` files.
The 16-test run overlaid exactly the three files changed by `d0401aa`.
A preliminary working-tree run also passed 16 tests, but the extracted runs define the accepted scope.
Service TypeScript, package manifests and locks, frontend changes, and provider output schema changes remain separately owned.

## R1: Whole-container retirement

At `src/process-supervisor.mjs:51`, `kill()` retains one cleanup promise and calls `retireContainer` even when the Docker exec child has already completed.
At lines 33 through 40, retirement inspects the immutable container ID, kills a running container, and inspects again to confirm it stopped.
Cancellation waits for this cleanup before rejecting the process result.
A cleanup failure becomes `sandbox-process-cleanup-unconfirmed`.

The additional completion reproduction wrote the exact Node script from the prior review to `/tmp/detach.cjs` through `writeTextFile`.
The script started a detached Node child with ignored stdio and `unref()`, scheduling `/tmp/review-detached` after 1200 milliseconds.
The review drained both output streams, observed exit code zero, called `kill()` twice, and confirmed Docker reported the container stopped.
Default resume refused the stopped container.
A deliberate test-only restart followed by a 1700-millisecond wait confirmed that the delayed marker did not appear.

The cancellation reproduction used the same detached pattern with a 1500-millisecond marker and a parent kept alive by `setInterval`.
An abort at 500 milliseconds rejected `wait()` with AbortError and stopped the entire container.
A deliberate test-only restart and delayed marker check confirmed the detached process was gone.
Both tests removed their containers and confirmed removal by immutable ID afterward.

Normal `wait()` completion alone does not prove all detached descendants have exited.
The complete cleanup boundary is explicit `kill()`, abort-driven retirement, or destruction of the dedicated container.
Callers must not treat a completed process result as proof of complete sandbox cleanup.
This matches the reviewed original completion reproduction, which explicitly called `kill()` after `wait()`.

## R3: Resume policy and immutable identity

At `88f4ca5:src/container-policy.mjs:14`, validation compares Docker's immutable container `Id` with the saved `instanceId`.
It also compares the container name, immutable image ID, and ownership labels.
The additional replacement test deleted an owned container and created another with the same name, owner, image, and creation arguments.
Resume rejected the replacement because its immutable instance ID differed.

At line 23, SecurityOpt must contain exactly the single approved `no-new-privileges` entry.
At lines 29 through 32, validation restricts network, PID, UTS, user, cgroup, and IPC namespace modes.
Separate real containers with disabled seccomp, host UTS, host PID, host IPC, host user namespace, host cgroup namespace, and host networking were each rejected.
All seven Docker configurations were supported by the local engine, so none of these checks was skipped.
Each test removed only its own container and confirmed removal.
Existing validation retains capability, privilege, resource, device, mount, running-state, and complete port-binding checks.

Graceful restart remains distinct from interrupted-review recovery.
An additional test wrote a marker, called `stop()`, confirmed default resume refusal, then explicitly set `restartStopped: true` and verified the same instance and preserved marker.
The transport option can restart any stopped instance that passes policy; it does not persist a special prohibition on restarting a previously cancelled instance.
The spike enforces the stronger interrupted-review policy by destroying the old container and creating a new container and session before recovery.
That orchestration is visible in `spike/adapters.mjs`; it does not depend on the transport distinguishing the cause of a stop.
The test-only restarts used to inspect delayed writes are not the spike's interrupted-review recovery policy.

## R2, R4, and acquisition registration

Bounded Docker operations and closed diagnostics remain intact.
The extracted 14-test run rejected the configured 50-millisecond hung control operation after about 54 milliseconds.
Retirement now has up to three separate 5-second Docker control budgets for inspect, kill, and confirmation.
This is an operation budget, not a universal wall-clock guarantee for every upstream adapter lifecycle call.
Intermediate spike `session.stop()` and `session.destroy()` calls remain direct awaits.
Cleanup uncertainty remains explicit in the final evidence.

The additional partial-acquisition check used real Docker for image inspection, container creation, and removal while injecting a failure at workspace setup.
Acquisition rejected with the injected failure, and inspection confirmed removal of the created immutable instance.
The review did not stop or reconfigure the shared Docker daemon.
Synthetic tests confirm that provider text, output values, arbitrary error messages, unknown event names, extra usage fields, console warnings, console errors, and direct stderr content do not enter the selected spike evidence.
No credentials or private runtime lifecycle files were read or printed.

In `d0401aa`, `onAcquiring` receives a frozen copy of the intended name, image, and owner before Docker run starts.
The callback is awaited, and a rejected callback prevents container creation.
Controlled tests verify both asynchronous ordering and registration failure.
After creation, the returned identity includes the immutable instance ID.
This closes the runtime-side ordering gap for a service that durably registers the callback identity.

The current service integration was read only to verify that connection.
`src/service/resources.ts` passes `store.registerResource` as the callback and updates the row with the final identity after acquisition.
`src/service/store.ts` performs that registration synchronously in SQLite.
Thus a resource row exists before Docker creation, including the interval before the instance ID becomes available.
A failure of the post-acquisition update can leave a live container, but its initial ownership record already exists for service recovery.
The separate service reviewer must validate recovery, failure handling, and durable-store behavior; this report does not extend its verdict to those files.

## Maintainability and typing

The existing module split is appropriate and no additional split is required.
Docker control, container policy, process execution, adapter orchestration, and evidence selection have distinct responsibilities.
The cleanup promise keeps repeated handle cleanup idempotent and keeps cancellation ordering visible.
The new registration callback is small and belongs in acquisition, before the side effect it records.
The ESM conventions remain consistent with the surrounding runtime code.

The `f305955` JSDoc annotation correctly describes the provider union and optional structured output, schema, and instructions arguments.
The installed `ai` declaration exports `FlexibleSchema`, which the annotation references.
The `d0401aa` annotations correctly allow asynchronous registration and an absent instance ID during acquisition.
No TypeScript build or type-safety claim is made for the separately changing service package.

## Verification record and remaining work

Host Node was `22.23.2` and Docker server was `29.4.0`.
The scoped command was `RUN_DOCKER_TESTS=1 node --test test/*.test.mjs`.
The extracted `88f4ca5` run passed 14 tests with zero failures and zero skips in 11.32 seconds.
The extracted callback overlay passed 16 tests with zero failures and zero skips in 9.31 seconds.
The preliminary working-tree run passed 16 tests in 10.65 seconds.
The twelve additional real Docker cases all passed against the extracted baseline.
No model inference was invoked and this review incurred no inference charges.

The runtime owner is separately finishing the real provider matrices and updating `runtime-spike-results.md`.
The coordinator must use that owner's final evidence for provider compatibility and keep graceful restart separate from cancellation recovery in the integration summary.
The earlier report's 13-test count and process-group-only description do not describe this reviewed revision.
No new model-streaming, authentication, or restart-matrix measurements are claimed here.

Implementation ownership remains with runtime dispatch `ctx_444414f4d43b`.
This independent review is dispatch `ctx_b9faaec355e3` and owns `references/ethglobal-competitive-analysis/runtime-final-quality-review.md` only.
The implementation plan and prior R1 through R4 review were read before testing.
No applicable repository AGENTS.md exists for the runtime or report paths; the supplied common instructions apply.
Existing dirty work was preserved, and no generated files or CHANGELOG files were modified.
