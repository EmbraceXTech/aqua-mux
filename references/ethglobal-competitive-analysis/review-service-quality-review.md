# ReviewService independent quality and security review

The initial review does not accept integration until the acquisition ownership and response envelope findings below are fixed and checked on committed revisions.
The reviewed baseline is d5d69cc6d275e34b7f2f3672fcf2fa0d8ec1b415 plus the service owner's provider, entrypoint, schema, SQLite lock, and transaction changes present on 2026-09-12.
This report owns no implementation files.

## Scope and ownership

The service owner is dispatch ctx_e88aa811a52c.
This review covers apps/agent-runner/src/service, service tests, and package wiring.
Runtime container policy and transport belong to ctx_444414f4d43b and their separate reviewer.
Runtime code was read only where needed to establish service acquisition and cleanup behavior.
The shared frontend schemas and runner caller were read to establish identity, generation, and response contracts.
No real inference was run by this reviewer.

## Findings requiring fixes

### R1: persist container ownership before creation and propagate cancellation

The initial provider calls createDockerSandbox without its AbortSignal and records the resource only after acquisition returns.
The runtime performs Docker creation and inspection before that return.
A forced crash after creation but before registration leaves an unrecorded container that recoverResources cannot retire.
Cancellation during this interval also cannot interrupt acquisition through the review signal.
The service owner accepted this finding and requested an awaited pre-creation identity callback from the runtime owner.
Acceptance requires durable registration before creation, signal propagation, and a regression that crashes during acquisition rather than waiting for the existing post-acquisition resource row.

### R2: validate and bound the complete persisted response

An authenticated HTTP reproduction injected a provider returning a valid hold result, usage.inputTokens equal to -1, and an unexpected string field of 1,100,000 characters.
The endpoint returned HTTP 200 with 1,100,294 bytes, preserved both invalid usage and the unknown field, and stored the response as succeeded.
Reviews.run initially validates only output.result and spreads the remaining provider object into its response.
The concrete production provider currently constructs fixed metadata, so this is a demonstrated service boundary defect rather than a demonstrated external exploit against that provider.
Acceptance requires a strict response contract, validated usage and metadata, and a serialized response limit enforced before persistence and transmission.

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
