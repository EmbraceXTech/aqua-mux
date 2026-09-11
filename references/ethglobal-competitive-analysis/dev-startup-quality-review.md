# Development startup quality review

Reviewed September 12, 2026 by dispatch `ctx_6bbc6c4c6795` and resumed by `ctx_449a8214a452` for task `task_934557956359`.
This reviewer owns this report and `repository-protocol-quality-review.md` only.
The implementation plan and applicable supplied agent instructions were read.

## Verdict

Accept startup source commit `018c50fd24071209148bc2e12dbd288003099b01`.
The blocking descendant cleanup defect is fixed, all seven focused tests pass, and controlled runner restart succeeds.
No remaining source correctness or module-maintainability finding blocks this startup deliverable.
Product proposal and transaction acceptance remain the separate integration reviewers' responsibility.

## Initial source checkpoint

The initial source review covers the uncommitted owner deliverables `scripts/dev-agent.mjs`, `scripts/dev-agent-config.mjs`, `scripts/dev-agent-process.mjs` and `scripts/dev-agent.test.mjs`.
There was no `scripts/dev-agent/` directory at this checkpoint.
Configuration, process management and command orchestration are separated into focused modules with no new dependency.
The split and repository conventions are acceptable.
At the initial checkpoint, acceptance was pending the cleanup correction, its regression evidence and an exact committed source review.

## Resolved blocking finding

`stop` in `scripts/dev-agent-process.mjs` skips a process group when its leader has already exited and waits only for the leader's exit promise.
An owned descendant can therefore survive cleanup and keep a development port occupied.
An independent process fixture reproduced this by launching a leader that spawned an unreferenced child, waiting for the leader to exit, calling `stop`, and checking the child's PID.
The result was `descendantAliveAfterStop: true`.
The reviewer terminated the fixture child and removed its temporary directory afterward.
The coordinator received the finding for routing to the source owner.
Track the owned process group through graceful shutdown and escalation even after leader exit, and add regression coverage for surviving descendants.

## Security and readiness evidence

The runner environment uses an explicit allowlist and excludes `PRIVATE_KEY`, database credentials, provider API overrides and `NODE_OPTIONS`.
Frontend override files are loaded only while building the frontend environment.
The runner receives the private authentication token as a server environment variable, without a public frontend prefix.
Token creation uses exclusive no-follow open, a restricted parent directory and mode 0600.
Existing tokens must belong to the current user, have the expected mode and format, and cannot be symlinks.
Diagnostics suppress arbitrary subprocess and environment-file contents.

The five existing tests passed with `node --test scripts/dev-agent.test.mjs`.
They cover token persistence and permissions, environment separation, frontend overrides, occupied-port refusal and direct-child graceful termination.
They did not cover the surviving-descendant failure.
The read-only command `node scripts/dev-agent.mjs status` reported authenticated runner readiness on port 33128 and frontend readiness false on port 33127.
The health implementation verifies runner authentication by comparing authenticated 404 and anonymous 401 responses with expected error codes.
This proves HTTP authentication and listener readiness, not provider inference or end-to-end proposal success.
Frontend readiness checks the actual managed catalog endpoint.
The command does not automatically restart a crashed child; it reports the exit and stops its owned services.
Restart persistence and a successful frontend proposal still need the owner's live evidence.
No transaction was requested or submitted during this review.

## Resumed review checkpoint

The resumed review retains the earlier independent reproduction and read-only health observations as historical evidence.
The current owner suite now contains a sixth regression test for a descendant whose group leader has exited.
Running `node --test scripts/dev-agent.test.mjs` again produced five passes and one failure with `owned descendant survived cleanup`.
The fixture registers cleanup for its child after the assertion.
The source owner and coordinator received the failure and request for a correction commit.
The five passing cases continue to support environment isolation, private token storage, port collision handling and graceful direct-child termination.
Acceptance remained blocked at this checkpoint on process-group cleanup and exact final source review.

## Final correction and verification

Commit `018c50fd24071209148bc2e12dbd288003099b01` contains exactly the four startup scripts named above.
The working source matched that commit during the final review.
`stop` now signals owned process groups regardless of leader state and probes group existence through graceful shutdown and forced termination.
It reports `cleanup_unconfirmed` if the group survives the bounded escalation period.
The correction stays inside the process helper and does not complicate configuration or command orchestration.

The reviewer ran `node --test scripts/dev-agent.test.mjs` after the correction and all seven tests passed.
The added process fixtures cover an exited leader with a surviving child and a surviving child that ignores SIGTERM.
The tests verify that those child PIDs no longer exist after cleanup.
A fresh `node scripts/dev-agent.mjs status` reported authenticated runner readiness on 33128 and frontend catalog readiness on 33127.

The reviewer also launched the actual runner command twice on preflight-checked port 43928, with an artificial signing sentinel in the parent environment.
Both launches reached authenticated readiness, exited with status zero after SIGTERM, and released the port for the same Node listener implementation to bind again.
The private token file hash was unchanged across the controlled restart.
The first verification attempt used a plain Python socket without address reuse and hit an address-in-use error after shutdown.
Repeating the check with the actual Node `availablePort` helper and restarting the actual runner established that this was not a surviving service listener.
The existing application on 33127 and runner on 33128 were not stopped by this test.
No provider review or transaction was submitted.

This verifies command startup, authentication, graceful shutdown, manual restart and token persistence.
It does not claim automatic crash restart, provider inference, or successful browser proposal generation.
The broader integration owner records coordinated application restart evidence in `dev-runner-integration-results.md`.
That report describes both shared services stopping, both ports passing bind checks, and both services becoming ready after restart.
The owner sent the same result directly to this reviewer.
The reviewer independently verified the isolated runner restart described above, but did not observe the owner's full application restart sequence.
Browser proposal evidence remains the separate integration scope.
