# Local ReviewService implementation and verification

Verified September 12, 2026, using Node 22.23.2 on the developer's local machine.
This report covers the persistent review process and its HTTP boundary.
It does not establish live wallet execution, complete LP lifecycle behavior, paid service eligibility, or recommendation quality.

## Implementation ownership

The service worker owns `apps/agent-runner/src/service/**`, `apps/agent-runner/test/service*`, and this report.
The runtime worker explicitly transferred `apps/agent-runner/package.json` and `package-lock.json` to this worker for service dependencies and scripts.
Runtime adapter, Docker transport, and spike files remain owned by the runtime worker.
The service imports the frontend's actual managed configuration, result, usage, policy, strategy-record, and primitive validators.
It imports the API worker's proposal-intent validator rather than copying that contract.

Core HTTP and persistence work was committed as `d5d69cc`.
The subsequent integration adds the real providers, derived output schema, restart resource ownership, bounded output validation, and opt-in HTTP verification executable.

| Module | Responsibility |
| --- | --- |
| `contract.ts` | Request validation, snapshot freshness, identity and policy checks, canonical idempotency fingerprint. |
| `http.ts` | Authentication, routes, HTTP limits, closed error responses. |
| `reviews.ts` | Admission, durable retries, active-review ownership, timeout and cancellation. |
| `store.ts` | SQLite requests, results and usage, event history, entitlement, resource ownership. |
| `database-lock.ts` | Process ownership through a held SQLite exclusive lock that the OS releases on a crash. |
| `provider.ts` | Real HarnessAgent invocation, streaming, usage extraction, session and container retirement. |
| `resources.ts` | Durable registration before container creation and identity-checked restart cleanup. |
| `output-schema.ts` | Provider-compatible schema derived from the shared validator and optional-null decoding. |
| `response.ts` | Strict result envelope, shared usage validation and serialized response limit. |
| `diagnostics.ts` | Suppression of arbitrary provider stdout, stderr and console output. |
| `main.ts` | Private process configuration, startup recovery, loopback listener and shutdown. |

## Start and API contract

Install both the frontend and agent-runner dependencies because the service directly imports shared TypeScript validators.
Build the runner's Docker image through `npm --prefix apps/agent-runner run image:build` if it is not already present.
Use an existing native Codex or Claude subscription login on the host.
API-key and Gateway environment overrides are refused by the runtime factory.

```sh
export AQUAMUX_AGENT_RUNNER_TOKEN="$(openssl rand -hex 32)"
npm --prefix apps/agent-runner run service
```

Give the same server token to the authenticated frontend backend through its private environment configuration.
Never put it in a browser bundle or public environment variable.
The default listener is `127.0.0.1:4319`.
Set `AQUAMUX_AGENT_RUNNER_PORT` to a known free port when needed; a collision fails startup.
`AQUAMUX_AGENT_RUNNER_HOST` accepts only `127.0.0.1` or `::1`.
`AQUAMUX_AGENT_RUNNER_PROVIDER` selects `codex` or `claude`, with Codex as the default.
`AQUAMUX_AGENT_RUNNER_DATABASE` optionally selects the private SQLite path; the default is `apps/agent-runner/.runtime/reviews.sqlite`.

`POST /reviews` requires `Authorization: Bearer <server token>`, JSON content type, and `Idempotency-Key` equal to `requestId`.
The body contains `requestId`, `owner`, `groupId`, `runGeneration`, `purpose`, `snapshot`, optional `botId`, and optional `deadline` in Unix milliseconds.
Interval requests require `config`.
Initial proposals may use `intent` and a deterministic `policyTemplate` supplied by the backend.
A model cannot create a proposed configuration without an exact supplied policy to preserve.

Successful responses contain `requestId`, the shared `ReviewResult`, `provider`, `model`, `runtimeVersion`, and `usage`.
Known token counts are integer strings and unknown counts are omitted.
`usage.cost` is `null`; no service price or payment is charged.
`DELETE /reviews/:requestId` authenticates with the same token and durably cancels a pending review.
It does not cancel a transaction or change an on-chain position.

Repeated identical requests return the same persisted result or terminal failure.
A changed body under the same request ID returns HTTP 409.
An interrupted request becomes `runner_restarted` with HTTP 503 after process restart and is never silently rerun.
The caller must obtain a fresh snapshot and issue a new request ID to perform new work.
The backend remains responsible for user ownership, browser leases, run-generation checks and fresh execution validation.

## Limits and isolation

The service permits two concurrent reviews, six new reviews per minute, and 200 per rolling day by default.
Minute and daily review counts come from SQLite and survive restart.
The HTTP layer additionally limits authenticated non-cancellation requests to 120 per minute.
Requests and serialized responses are limited to 128 KiB.
The inference deadline is 120 seconds by default, shortened by the supplied deadline.
Docker cleanup has its own bounded runtime deadlines and the final session shutdown wait is limited to ten seconds.
An unresolved owned resource blocks new inference until restart cleanup succeeds.

Every review uses a fresh container and native session.
The runtime has no host filesystem mounts or signing environment.
The service supplies only validated configuration, intent and observation data; there are no host-executed model tools or shell HTTP endpoints.
The Codex adapter still has native tools inside its isolated container, so this is a container boundary rather than a claim that its built-in shell capability has been disabled.
Neither provider can submit through the service, emit accepted raw transaction fields, change the supplied policy, or choose a different maker or chain.
Model instructions alone do not establish any of these checks.

Container identity is persisted before creation through the runtime's awaited `onAcquiring` callback.
The successful acquisition adds Docker's immutable instance ID.
Restart cleanup checks the stored name, image, owner label and available instance ID before removing a container.
A mismatched identity fails recovery rather than removing an unrelated resource.
SQLite persists cancellation before the abort signal is delivered, and late output cannot replace the cancelled row.

Snapshot timestamps, chain, maker, duplicate balances and configured token metadata are checked at admission.
Optional managed strategy records use the shared strategy-instance validator.
Position-reconciliation observations are accepted as a bounded JSON record supplied by the authenticated backend and remain untrusted model input.
Execution must refresh state again because a valid review can finish after the input snapshot ages.

## Verification evidence

`npm --prefix apps/agent-runner test` runs the existing runtime suite and all service tests without invoking a paid or subscription model.
The service suite has 16 passing tests.
The runtime portion at this checkpoint passed 13 tests and skipped three opt-in Docker tests.
The dedicated runtime worker owns its broader Docker and subscription spike evidence.

Service tests cover authenticated HTTP, invalid methods and payloads, concurrent and durable deduplication, identity and freshness refusal, policy mutation refusal, closed provider errors, cancellation, timeout, quota, restart recovery and live database ownership.
Additional regression tests cover a real child-process SIGKILL during controlled acquisition, cancellation signal propagation, uncertain cleanup refusal, identity-checked removal, strict output envelopes, negative usage and oversized valid results.
The acquisition test uses a controlled adapter double to stop exactly after durable registration.
The HTTP runs below additionally exercise actual Docker containers and native model runtimes.

```sh
npm --prefix apps/agent-runner run test:service
npm --prefix apps/agent-runner run typecheck:service
npm --prefix apps/agent-runner run test:service:live -- codex
npm --prefix apps/agent-runner run test:service:live -- claude
```

The opt-in HTTP runs start the actual service entrypoint with a random token and a private temporary database.
They authenticate, request real model inference, validate the result, repeat the request, restart the process, cancel a new review, kill the process during another active review, and verify restart cleanup.
Their wallet snapshots are explicitly synthetic and their final policy permits only hold.
These are real provider and service lifecycle checks, not live chain or financial-performance evidence.

| Provider | Final check start, UTC | Review elapsed | Input tokens | Output tokens | Result |
| --- | --- | --- | --- | --- | --- |
| Codex, `gpt-6-astra` | 2026-09-11 20:25:08 | 18,332 ms | 11,326 | 277 | Hold; all HTTP, retry, cancellation and restart checks passed. |
| Claude, `claude-sonnet-4-6` | 2026-09-11 20:25:08 | 32,150 ms | 32,330 | 723 | Hold; all HTTP, retry, cancellation and restart checks passed. |

The private local evidence files are `.runtime/service-live-codex-1789158308143/evidence.json` and `.runtime/service-live-claude-1789158308142/evidence.json` under `apps/agent-runner`.
They contain fixed check outcomes, elapsed time and usage, with no tokens, raw diagnostics or model reasoning.
The pinned runtime versions are Harness 1.0.108, Codex adapter 1.0.110, Claude Code adapter 1.0.112 and AI SDK 7.0.98.
Zod is pinned to 4.5.4 to match the shared frontend validators.

The full shared schema initially triggered a Codex required-field rejection.
The service now derives the strict wire schema automatically, represents optional properties as nullable, replaces discriminated `oneOf` with `anyOf`, and validates decoded output with the unchanged shared schema.
A previous Claude test allowed opening and observed a valid opening proposal; the final hold-only fixture constrains that decision explicitly through policy.
No fake fallback result is returned after a provider error or schema rejection.

## Independent review

Independent reviewer dispatch `ctx_4b875f6c6f84` identified the acquisition registration gap and the unbounded provider envelope.
Both findings have regression tests and implementation fixes in the integration revision.
Final acceptance remains with that reviewer and the coordinating worker after they inspect the exact revision.
