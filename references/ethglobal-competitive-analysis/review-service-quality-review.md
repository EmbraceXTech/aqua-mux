# ReviewService independent quality and security review

The service review accepts d5d69cc6d275e34b7f2f3672fcf2fa0d8ec1b415 and 64bc2ae26f0d98c0aec410fcd8c7f6c550ff818b.
Both findings below are resolved in 64bc2ae, and no service changes remain required.
The initial review inspected the core baseline and the service owner's integration work on 2026-09-12.
Final service source, tests and package files match 64bc2ae.
This report owns no implementation files.

## Scope and ownership

The service owner is dispatch ctx_e88aa811a52c.
This review covers apps/agent-runner/src/service, service tests, and package wiring.
Runtime container policy and transport belong to ctx_444414f4d43b and their separate reviewer.
Runtime code was read only where needed to establish service acquisition and cleanup behavior.
The shared frontend schemas and runner caller were read to establish identity, generation, and response contracts.
No real inference was run by this reviewer.

## Resolved findings

### R1: persist container ownership before creation and propagate cancellation

The initial provider calls createDockerSandbox without its AbortSignal and records the resource only after acquisition returns.
The runtime performs Docker creation and inspection before that return.
A forced crash after creation but before registration leaves an unrecorded container that recoverResources cannot retire.
Cancellation during this interval also cannot interrupt acquisition through the review signal.
The service owner accepted this finding and requested an awaited pre-creation identity callback from the runtime owner.
The fix durably registers the container name, image and owner before creation through the awaited runtime callback in d0401aafa7a6e8b82a0d2461a71d172942685621.
The service propagates the signal, records the immutable instance ID after acquisition, verifies ownership during recovery, and refuses new inference if cleanup is unresolved.
The new controlled acquisition test kills a real child process immediately after registration and checks durable restart recovery.
Separate recovery tests verify refusal to remove mismatched ownership and removal by immutable instance ID.

### R2: validate and bound the complete persisted response

An authenticated HTTP reproduction injected a provider returning a valid hold result, usage.inputTokens equal to -1, and an unexpected string field of 1,100,000 characters.
The endpoint returned HTTP 200 with 1,100,294 bytes, preserved both invalid usage and the unknown field, and stored the response as succeeded.
Reviews.run initially validates only output.result and spreads the remaining provider object into its response.
The concrete production provider currently constructs fixed metadata, so this is a demonstrated service boundary defect rather than a demonstrated external exploit against that provider.
The fix validates a strict envelope using the shared usage schema, rejects unknown fields, constructs only allowed response fields, and caps the serialized response at 128 KiB before persistence.
The identical independent HTTP reproduction now returns HTTP 502 with 46 bytes and no invalid usage or unexpected field.
Regression tests also reject a schema-valid result that exceeds the byte limit.

## Independent verification

The initial npm run test:service run passed all 11 tests.
The tests cover bearer authentication, browser-origin refusal, endpoint and input limits, duplicate requests, changed generation conflicts, freshness, model policy changes, safe errors, cancellation, quota, restart, and exclusive database ownership.
A temporary reviewer script exercised actual authenticated HTTP and subprocess entrypoints without inference.
It also verified these cases:

- Changing owner under the same request ID returns HTTP 409.
- A provider finishing after cancellation cannot replace the durable cancelled status with success.
- Public binding, an unknown provider, an invalid port, and a synthetic API-key environment all cause startup refusal without exposing the synthetic secret marker.
- An actual SIGKILL releases the SQLite exclusive owner lock and a restarted store marks the durable running request runner_restarted.

The temporary script is /tmp/aquamux-review-service-adversarial.mts.
Its response reproduction is summarized above so the finding does not depend on retaining the temporary file.
The first package test invocation used the repository root and failed because that directory has no package.json.
The successful invocation used apps/agent-runner.

## Design assessment

The module split separates HTTP parsing and authentication, request and result validation, active review ownership, durable persistence, process locking, schema adaptation, provider execution, startup, and diagnostics.
These are focused responsibilities with no need for an additional framework or generic provider registry.
The wire schema derives from the shared reviewResultSchema and converts optional fields to nullable required fields before decoding them back through shared validation.
The service bearer credential authenticates the trusted frontend backend, not individual wallet owners.
Owner and generation participate in request fingerprints; the frontend owns wallet authentication and current-generation execution fencing.
The service has no signing or execution endpoint.
A cancelled or failed review cannot become a fake successful result, and inference cost remains unknown rather than fabricated.
Production startup restricts binding to loopback, rejects API-key provider configuration, removes unrelated host environment values, and suppresses raw adapter diagnostics.
Subscription runtime isolation remains subject to the separate runtime review.

## Final verification and limits

The final independent service suite passed 16 of 16 tests.
The default npm test command passed 13 runtime checks with three opt-in Docker checks skipped, then passed all 16 service tests.
The separate runtime reviewer owns transport acceptance; running the default package command here verified service test wiring.
Strict npm run typecheck:service passed with runtime typing dependency aa718ef24a87867fc9803cb3bfab24fee3e33d37.
That committed dependency matches the sandbox method and declaration changes used in the independent check.
No agent-runner working-tree differences remained when the final report was prepared.
The independent HTTP and subprocess reproduction passed after the fixes, including changed-owner conflict, late cancellation, startup refusal and forced-crash SQLite recovery.

The service owner's saved evidence was read directly from .runtime/service-live-codex-1789158308143/evidence.json and .runtime/service-live-claude-1789158308142/evidence.json under apps/agent-runner.
Both record real-provider hold results, usage, durable retry, completed restart recovery, cancellation and forced-kill container cleanup as passed.
Their inputs were synthetic wallet snapshots and their policies allowed only hold.
This reviewer inspected the evidence and its executable test source but did not repeat real inference.
These checks do not establish recommendation quality, live wallet execution, profitability, delegated execution or paid-service readiness.

The report is the only repository file changed by this reviewer.
The initial findings were committed as a10b38b.
