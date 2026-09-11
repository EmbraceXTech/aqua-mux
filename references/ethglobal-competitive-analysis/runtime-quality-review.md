# Runtime spike quality review

Reviewed September 12, 2026.
The reviewed revision is `f0a06ad0c65f212e741fc99f50dd1609a6cc4766`.
All source line references below refer to that commit.
The review owns only this report and makes no implementation changes.

## Acceptance verdict

Changes required before accepting the runtime transport for integration.
The existing tests pass, but independent Docker checks reproduce incomplete descendant cleanup and incomplete validation of resumed containers.
The spike is useful compatibility scaffolding, but this review does not establish successful subscription inference or the complete phase 0 acceptance gate.
No real inference calls, credential reads, or new inference charges were needed for this review.

## Must-fix findings

### R1: Completed parent processes can leave running descendants

Priority P1.
Location: `apps/agent-runner/src/docker-sandbox.mjs:27-29`, `:58-61`, and `:67-69`.
The launcher deletes its process-group PID file when the shell exits, and the host marks the handle finished when Docker exec closes.
Subsequent `kill()` calls return without checking surviving descendants.
A shell command that backgrounds a child with redirected output therefore outlives both `wait()` and `kill()`.
This matters because the harness exposes shell tools, and cancelling or retiring a review must not leave its tool commands running in the retained container.

Reproduced using a fresh real sandbox and the command `(sleep 1; touch /tmp/review-orphan) >/dev/null 2>&1 &`.
After draining both streams and awaiting `wait()`, the review called `kill()`, aborted its controller, and waited 1300 milliseconds.
A subsequent `test -e /tmp/review-orphan` exited zero.
The review destroyed the sandbox afterward.

Required change: give subprocess descendants a supervised lifetime and make cancellation verify their termination even if the shell has exited.
If reliable per-command cleanup is unavailable, retire the entire sandbox on interruption and state that loss of resumability explicitly.
Add a real Docker regression test for background descendants and another for cancellation during startup.
The existing test delays cancellation by 500 milliseconds and exercises only a foreground shell group.
An immediate-abort check in this review passed once, which does not establish that the startup race is absent.

### R2: Docker operations have no bounded completion or comprehensive acquisition cleanup

Priority P1.
Location: `apps/agent-runner/src/docker-sandbox.mjs:6-19`, `:35-44`, and `:58-63`; `apps/agent-runner/spike/adapters.mjs:76-79`.
The Docker helper waits indefinitely for its child to close and accepts neither a timeout nor an abort signal.
Creation, inspection, stopping, removal, and the Docker exec used to kill a command all use this helper.
An unavailable or stalled Docker daemon can therefore prevent cancellation and prevent the spike from recording its outcome, despite the inference timeout.
The kill fallback runs only when the helper rejects, so a hung helper never reaches it.
Creation also returns its handle only after workspace creation and inspection have succeeded.
If either step fails after `docker run`, the caller has no sandbox handle to destroy in its finally block.
These paths follow directly from the source; a Docker daemon outage was not induced on the shared machine.

Required change: use a bounded Docker command executor, pass cancellation where appropriate, and use a separate bounded cleanup budget.
Track container ownership immediately after creation and remove owned containers on every later initialization failure.
Persist a cleanup failure explicitly instead of losing the entire evidence record when destruction rejects.
Add controlled subprocess tests for a hung Docker command and acquisition failure, plus a real-container cleanup assertion.

### R3: Resume accepts containers without the creation-time isolation policy

Priority P2 for this private local spike; required before using resume in an authenticated runner.
Location: `apps/agent-runner/src/docker-sandbox.mjs:40-44`.
Resume checks the name pattern, a public label, absence of mounts, and the first loopback port binding.
It does not validate the image identity, capability drops, privilege restrictions, resource limits, namespace modes, additional port bindings, or container ownership beyond that label.
A container created outside this runner can satisfy the checked fields while missing its isolation policy.
The implementation still requests the node user for spawned commands, so the reproduction does not establish root execution by those commands.
It establishes that the claimed container policy is not checked.

A real Docker reproduction created a container using the expected name prefix and label, no mounts, a loopback port, and the spike image, but with user root and no restriction flags.
`createDockerSandbox({ id })` accepted it.
Inspection returned `user: root`, `capDrop: null`, `memory: 0`, and `securityOpt: null`.
The review removed this container immediately afterward.
An attacker who already controls the Docker daemon has broader powers; the finding concerns fail-closed resume validation and accidental substitution, not a demonstrated remote privilege escalation.

Required change: validate the full effective isolation configuration against the creation policy and bind persisted sessions to the expected container and image identity.
Reject stopped or incompatible containers with a recovery-specific error.
Add negative tests for missing restrictions and unexpected port or namespace configuration.

### R4: Evidence logging can expose arbitrary provider error content

Priority P2.
Location: `apps/agent-runner/spike/adapters.mjs:30`, `:41`, `:48`, `:69`, and `:73-80`.
The failure path copies the provider error message into the evidence and console output after removing only whitespace-delimited strings beginning with `Bearer`, `sk-`, or `eyJ`.
This is not a complete secret boundary for arbitrary error messages, URLs, environment assignments, or provider-specific token formats.
For example, a synthetic message containing `access_token=synthetic-secret` passes through unchanged.
The successful evidence spreads full turn results as well, and only some calls replace the returned text before logging it.
This review did not encounter an actual secret leak and did not inspect private evidence files.

Required change: log a closed set of error classifications and explicitly selected evidence fields.
Keep arbitrary provider messages and model text out of console evidence by default.
Add synthetic tests proving that unrecognized token formats, URL query credentials, and environment-shaped values cannot enter emitted evidence.

## Authentication and secret boundaries

The spike entry point clears the host environment before creating agents.
The Docker CLI receives a short environment allowlist, and newly created containers have no host mounts or Docker socket.
Credentials supplied to the launcher go over stdin rather than command arguments or Docker container Env.
These are useful boundaries, and the existing real-container canary test passed.
The direct provider credentials remain readable to processes inside the same container, so the sandbox is not an isolation boundary between model tools and their inference credentials.
It must never receive signing credentials.

The installed pinned Codex adapter resolves native subscription credentials through the Codex auth store and its configured file or keyring mode.
The installed Claude adapter resolves its credential file or macOS Keychain and can refresh OAuth credentials.
Source inspection found that explicit `auth: direct` disables the Claude API-key helper fallback.
Both adapters can still select direct API-key environment credentials when those exist.
The spike's environment clearing removes those keys, but importing `createAgent()` elsewhere does not automatically enforce that policy.
Before runner integration, make subscription-only credential selection an explicit interface with synthetic fail-closed tests, instead of relying on a global process-environment mutation by one CLI entry point.
Record only the credential source classification, never credential content.
Actual authentication success remains the runtime worker's evidence responsibility.

The shipped bridge code checks a channel token on WebSocket connection.
Loopback publication therefore does not imply a deliberately public unauthenticated shell endpoint.
This review did not perform a bridge authentication penetration test or verify an authenticated application runner endpoint, which this commit does not implement.

## Session resume and cancellation evidence

Prepare stores a session identifier, resume state, marker, and container identifier in an ignored directory with restrictive requested modes.
Resume verifies the previous conversation marker, which is a meaningful cross-process continuity check.
The design retains the same container and its filesystem; it does not prove restoration after container loss or a host restart.
State writes are not atomic, and a stale or malformed state file fails before the main evidence-producing try block.
These are recovery limitations to address before treating this as durable application storage.

The review observed concurrent edits to `spike/adapters.mjs` that retire an interrupted session before trying a recovery turn.
It later observed concurrent edits to `src/docker-sandbox.mjs` covering a cancellation marker, one creation-failure branch, and file-read errors.
Those edits are outside `f0a06ad` and are not accepted by this report.
The coordinator should request review of the resulting follow-up commit and fresh evidence.
A fresh-session recovery result must not be described as reuse of the interrupted session.

## Modules, conventions, and dependency pinning

The initial split between transport, harness configuration, and the spike driver is reasonable for this small experiment.
There is no need to split every small helper into a separate file.
The transport currently combines Docker control commands, an embedded process supervisor, policy validation, stream conversion, and file operations.
The lifecycle fixes warrant extracting a testable command executor and process supervisor while keeping the public sandbox adapter focused on the harness contract.
Keep container policy construction and resume validation together so they cannot drift independently.
Use one statement per line in lifecycle code and expand nested one-line handlers where error and cleanup ordering matters.
The existing compact style makes those ordering requirements harder to inspect.

The package pins all four direct SDK dependencies and includes an npm lockfile.
The Dockerfile pins its Node base by digest and pnpm by version.
The installed harnesses ship their own bridge lockfiles and install them with `pnpm install --frozen-lockfile`.
Their bridge package manifests pin Codex SDK `0.149.1`, Claude Agent SDK `0.3.245`, and Claude Code `2.1.245`.
The apt package index and ca-certificates package are not pinned, and the runtime selects a mutable local image tag by default.
Record the built image ID and effective native runtime versions with compatibility evidence.
The current pinning is a reasonable spike baseline, but a lockfile alone does not identify the actual local image that ran.

No applicable repository AGENTS.md was found for this app or report; the supplied common instructions apply.
The frontend-specific AGENTS.md is outside this ownership scope.
Existing unrelated dirty files and all generated files were preserved.

## Verification and handoff

Executed `npm test` in `apps/agent-runner`.
Two tests passed and the opt-in Docker test was skipped as configured.
Executed `npm run test:docker` separately.
Its real-container test passed, including file transport, host-environment canary isolation, capability inspection, and foreground cancellation cleanup.
The additional real Docker checks above reproduced R1 and R3 and cleaned up their own containers.
No source or test files were changed by this review.
The checked transport was still identical to `f0a06ad` during those checks; concurrent transport edits appeared afterward.

The committed tests are meaningful but narrow.
They do not cover descendant cleanup, hung Docker operations, partial initialization failure, rejected resume configurations, evidence sanitization, or subscription-source refusal.
There is no dedicated lint script in this package.
The review did not run paid adapter turns or broaden frontend testing for a report-only change.

Implementation ownership remains with the runtime worker and any repair worker assigned by the coordinator.
This review owns `references/ethglobal-competitive-analysis/runtime-quality-review.md` only.
Route R1 through R4 to a repair worker, require focused tests and a separate review of the resulting commit, and keep the phase 0 runtime gate open until the provider evidence and cleanup requirements pass.
