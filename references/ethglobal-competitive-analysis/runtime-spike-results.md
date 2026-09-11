# Local agent runtime compatibility spike

Tested September 12, 2026, Asia/Bangkok.
This report covers phase 0 runtime compatibility only.
This spike implements no LP recipes, review HTTP service, scheduler, transaction planner, or signing feature.

## Gate result

The preferred AI SDK HarnessAgent path supports the existing local subscriptions.
Claude Code passed invocation, incremental text streaming, structured output, timeout, cancellation, and recovery after a separate host process restarted the stopped runtime.
Codex passed invocation, event streaming, structured output, timeout, cancellation, and recovery after a separate host process restarted the stopped runtime.
An interrupted runtime must retire its entire dedicated container before the next review.
Immediate Codex session reuse reproduced a late abort-frame error, and process-group-only cleanup did not contain detached children.
The final transport destroys interrupted containers and creates fresh containers for subsequent reviews.

Use the existing harness adapters with the isolated local Docker transport in `apps/agent-runner`.
A custom native-runtime bridge is not justified by the tested authentication path.
The local transport implements the AI SDK sandbox interface while preserving the adapters' own bootstrap, protocol, schema handling, and session state.
Keep this integration limited to the developer's private prototype.
It is not a production multi-user authentication or signing boundary.

## Exact tested versions

| Component | Version |
| --- | --- |
| Host Node.js | 22.23.2 |
| Host Codex CLI | 0.154.0 |
| Host Claude Code | 2.1.269 |
| Docker server | 29.4.0, local OrbStack engine |
| Container Node.js | 24.21.0 |
| Container pnpm | 10.32.1 |
| `ai` | 7.0.98 |
| `@ai-sdk/harness` | 1.0.108 |
| `@ai-sdk/harness-codex` | 1.0.110 |
| `@ai-sdk/harness-claude-code` | 1.0.112 |
| Adapter-bundled Codex SDK and CLI | 0.149.1 |
| Adapter-bundled Claude Agent SDK | 0.3.245 |
| Adapter-bundled Claude Code | 2.1.245 |
| Requested Codex model | `gpt-6-astra`, medium reasoning |
| Requested Claude model | `claude-sonnet-4-6`, thinking disabled |

The built image identity recorded by Docker is `sha256:3ee8882d525afece0a9321c8f7f946dc80a46c69ff8b91a05757a45524c4602f`.
The container base is `node:24-bookworm-slim` at digest `sha256:2fe369e969550cde8e867afc3fe370b260140cab4a23d467074295b42163d553`.
Host npm dependencies are pinned in the package manifest and package lock.
Each adapter ships a separate frozen pnpm lock for its sandbox bootstrap.
The host's installed CLI version is not the CLI version that the adapter runs inside Docker.
Codex's bundled runtime warned that metadata for `gpt-6-astra` was missing and that it used fallback metadata.
Actual model requests succeeded, but the warning remains an upstream compatibility caveat.

## Authentication evidence and documentation gap

`codex login status` reported `Logged in using ChatGPT`.
The sanitized `claude auth status` fields reported `loggedIn: true`, `authMethod: claude.ai`, `apiProvider: firstParty`, and `subscriptionType: team`.
No authentication files, tokens, account identifiers, or emails were printed or committed.

The spike clears the host process environment except the explicit native-login lookup and Docker transport inputs.
It selects `auth: 'direct'` for both adapters and removes all provider API-key, Gateway, and provider-URL environment overrides.
Codex's adapter source resolves its native authentication store and routes the discovered OAuth credential to the ChatGPT Codex backend.
Claude's adapter source reads its native credential file or macOS Keychain and forwards the discovered OAuth credential through `CLAUDE_CODE_OAUTH_TOKEN`.
The source also contains refresh logic, but this spike does not prove that a refresh occurred.

The public [Codex adapter documentation](https://ai-sdk.dev/providers/ai-sdk-harnesses/codex) and [Claude Code adapter documentation](https://ai-sdk.dev/providers/ai-sdk-harnesses/claude-code) explain the sandbox bridge, environment credential modes, and native structured-output integration.
The fetched pages do not describe the native subscription discovery present in the installed versions.
The package implementations provide the additional evidence: `resolveCodexAuthentication` and `readCodexSubscription` in `@ai-sdk/harness-codex/dist/index.js`, and `resolveClaudeCodeAuthentication` and `readClaudeCodeSubscription` in `@ai-sdk/harness-claude-code/dist/index.js`.
These are upstream installed files and were inspected without modification.
[OpenAI authentication documentation](https://developers.openai.com/codex/auth/) provides the official native authentication context.

The Codex adapter names the forwarded OAuth value `CODEX_API_KEY` internally.
That environment-variable name does not mean this run substituted an API billing credential.
The source resolved the value from the native subscription store after API-key environment variables were removed.

## Measured behavior

Each value below comes from a real model request, unless explicitly described as a container test.
Timing measures one observed run and is not a latency benchmark or service-level promise.

| Check | Codex | Claude Code |
| --- | --- | --- |
| Basic inference | Returned `SPIKE_OK`. | Returned `SPIKE_OK`. |
| Text streaming | One completed text delta in the weather response; event transport worked, token-by-token text was not observed. | 86 text deltas in the final transport run; first at 8743 ms, last at 13321 ms. |
| Structured response | Schema-constrained object with `status: hold` and `marker: schema-proof`, followed by host validation. | Same schema-constrained object and host validation. |
| Restart/session recovery | Stopped runtime, persisted state, exited host process, then recalled the exact prior random marker in a new process. | Same two-process test and exact marker recall. |
| Timeout | Host rejected at 1502 ms in the final test; a fresh container returned `RECOVERED`. | Host rejected at 1502 ms; a fresh container returned `RECOVERED`. |
| Explicit cancellation | Host rejected at 1502 ms; a fresh container returned `RECOVERED`. | Host rejected at 1501 ms; a fresh container returned `RECOVERED`. |
| Immediate session reuse after interruption | Failed once with the previous turn's late abort error. | Passed for both timeout and cancellation. |

Claude's final streaming request reported 25280 input tokens and 248 output tokens through the adapter.
The final Codex weather request reported 8306 input tokens and 211 output tokens.
These are reported usage counts, not measured subscription charges.
No monetary inference cost was inferred from subscription usage.
Final repaired evidence includes only approved event type counts, numeric timings and usage, fixed check results, image identity, diagnostic counts, and closed error classifications.
Arbitrary model text, provider error messages, console warnings, and direct stderr diagnostics are excluded.
Reasoning content was never retained in the report or spike evidence.

The private `.runtime` directory contains the raw lifecycle state needed for the two-process test and sanitized evidence JSON.
Its directory mode is 0700 and state/evidence files use 0600; the directory is ignored by Git.
State updates use a temporary file followed by atomic rename.
Lifecycle state can include a bridge authentication token and must never be exposed through product responses or committed.
The report is the durable shareable evidence record.

## Isolation and failure handling

The local Docker transport starts a non-root container with all Linux capabilities dropped, `no-new-privileges`, memory/CPU/process limits, and an init process.
The WebSocket bridge publishes only on `127.0.0.1` using a dynamically assigned host port.
No host directory, repository, credential directory, Docker socket, or signing material is mounted.
The Docker build context excludes everything except the Dockerfile.
Provider subscription credentials travel through process stdin into the adapter bridge environment, rather than Docker container configuration or process arguments.
The adapter issues a warning because this local transport does not implement request-transform credential brokering.
The model runtime therefore has access to its own inference credential inside the disposable container.
This is acceptable only for the private spike and must be reviewed before broader use.

A real container test confirmed that a synthetic signing-secret environment canary was absent, `/Users/sainytk` was absent, and `/var/run/docker.sock` was absent.
It also confirmed non-root execution, no mounts, capability removal, and loopback binding through Docker inspection.
The transport stops and verifies the entire dedicated container on explicit process-handle kill or abort, including when the parent process already completed.
It does not rely on process groups to contain daemonized children.
Real-container regressions cover foreground cancellation, immediate startup cancellation, a background shell child, and detached Node children after both normal parent completion and cancellation.
No delayed child marker appeared after container retirement and an explicit inspection-only restart.
Model reviews after interruption instead delete that container and acquire a fresh one.
No real signing key was loaded for these tests.

The container permits outbound networking for package installation and inference.
This spike does not enforce provider-only egress or prove isolation from host-accessible network services.
The runner must never colocate an unauthenticated signer endpoint on a network reachable by the model container.
No host-executed tools were registered.
The Codex adapter cannot filter its built-in tools, so the external container boundary is required.

Two setup failures were corrected before successful inference.
The minimal Node image lacked pnpm, which the adapter bootstrap invokes.
Codex also failed its first network request until CA certificates were installed in the image.
No adapter source, bundled runtime, authentication policy, or TLS verification was weakened to obtain a successful request.

## Recommended integration contract

Keep the future review service independent of provider-specific conversation IDs and bridge state.
A review request should carry its request ID, authenticated owner, bot ID, run generation, snapshot ID, strategy version, structured input, and deadline.
A result should carry the same request identity, provider/runtime versions, a validated recommendation or an explicit failure, visible explanation, usage, and source coverage.
Amounts and transaction policy belong to deterministic validation outside this runtime.
The schema used here is only a compatibility fixture and is not the future LP recommendation schema.

Expose normalized `started`, `text-delta`, `completed`, `cancelled`, `timed-out`, and `failed` events.
Do not imply incremental token streaming for Codex when its tested SDK supplies only completed text items.
Do not publish hidden reasoning or raw adapter diagnostics.
Persist a terminal review state before accepting another run for the same bot.
After timeout or cancellation, stop and remove the interrupted container before starting a fresh container and review from the current snapshot and run generation.
Treat the interrupted session as discarded; do not reuse its filesystem for another model review.
An old stream's output cannot authorize a transaction.

Store resume state only on the trusted runner side and scope it to one owner and runtime.
The test proves graceful stop/resume across host processes while the same exact container filesystem survives.
Ordinary resume rejects a stopped container; the deliberate graceful recovery path passes `restartStopped: true` only after validating the saved immutable container ID, image, ownership, and full supported isolation policy.
This graceful path is separate from interruption recovery, which uses a new container.
It does not prove recovery after container deletion, lost storage, machine reboot, token revocation, or an abrupt crash before lifecycle state was persisted.
Those failure modes remain acceptance work for the durable review service.

## Reproduction and checks

Run these commands from `apps/agent-runner` with the existing local subscriptions and Docker running.
Do not pass API keys or copy signing credentials into the runner.

```sh
npm ci --ignore-scripts
npm run image:build
npm test
npm run test:docker
npm run spike:adapters -- claude prepare
npm run spike:adapters -- claude resume
npm run spike:adapters -- codex prepare
npm run spike:adapters -- codex resume
```

Each `prepare` command stops its runtime and exits while retaining only its owned container for the following `resume` command.
Each `resume` command uses a new host process and destroys its container when the matrix finishes or fails.
Use the two commands in order and do not run concurrent spike sessions for the same provider.
If interrupted between those commands, use the private state file to identify and remove that exact spike container.
Do not remove unrelated Docker containers.

The expanded checks include 13 unit/control tests and 3 real-container tests, run with `RUN_DOCKER_TESTS=1`, including real-container regressions and controlled subprocess failures.
`git diff --check` passed for the owned spike files.
The initial implementation is committed as `f0a06ad`.
The final Codex matrix began at 2026-09-11 20:19:40 UTC, and the final Claude matrix began at 20:20:47 UTC.
Both completed every check with `runtime: stopped` and `container: removed` cleanup outcomes.
Both interruption checks recorded `recoveryPolicy: destroy-container-create-fresh`.
The final transport is committed as `88f4ca5`, with the durable acquisition callback in `d0401aa`.
The [initial quality review](runtime-quality-review.md) identified four transport and evidence issues.
The [second review](runtime-repair-quality-review.md) required complete detached-process retirement and exact security-option checks, which the final transport implements.
The repairs add bounded Docker control commands and separate cleanup budgets, comprehensive owned-container acquisition cleanup, whole-container retirement, and fail-closed resume validation against saved ownership plus immutable container and image identities.
Resume also verifies the effective capability, privilege, resource, namespace, running-state, mount, and complete port configuration.
Security options are exact rather than accepting weaker supersets, and host UTS, user, and cgroup namespaces are refused.
An awaited optional `onAcquiring` callback allows the service to persist resource ownership before Docker creation; registration failure creates no container.
Factory calls reject API-key and Gateway environment overrides before environment stripping, including when imported outside the spike CLI.
Synthetic evidence tests cover URL query credentials, environment-shaped values, unknown token formats, and direct stderr output.
Cleanup failures remain explicit `unconfirmed` evidence and cause a failed exit.
Independent re-review of the repair is required before integration acceptance.
