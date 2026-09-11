# Auth loopback URL fix results

## Reproduction

The existing Next server at `http://127.0.0.1:33127` returned HTTP 403 from `/api/managed/groups` with the configured browser Origin and Host.
The response was `{"code":"authentication_failed","error":"Request URL origin is not allowed."}`.
This happened before the bearer-token check, so a valid session could not pass the URL guard.
The new focused regression test also failed before the implementation with `Request URL origin is not allowed.` for an internal `localhost` URL.

## Implementation and ownership

`apps/frontend/lib/server/auth/index.ts` retains its existing Origin and session checks and calls a focused helper only when the request URL origin differs from the configured origin.
`apps/frontend/lib/server/auth/request-origin.ts` permits only the literal loopback hostnames `127.0.0.1`, `localhost`, and `[::1]`, with matching protocol and port and an exact configured Host header.
Mutations still require the exact configured Origin.
The coordinator approved originless GET/HEAD requests only with `Sec-Fetch-Site: same-origin`, since browser same-origin fetch reads normally omit Origin.
The alias helper refuses foreign forwarding hosts, protocols, ports, remote forwarded peers, any Forwarded header, and non-same-origin fetch metadata.
Forwarding headers never select or override the trusted origin.
The existing exact-URL path remains unchanged, including same-origin GET authentication without Origin.
This exception assumes a loopback-bound local prototype and does not authorize publishing the server through a remote proxy.

The worker owns the auth entry point, the new helper, `test/managed-auth-origin.test.ts`, `test/managed-auth-next.test.ts`, and this report.
No dev-wallet, UI, generated, changelog, or unrelated dirty files were modified.
The helper follows the separate dev-wallet guard's literal loopback and exact browser-header convention without coupling owner-session authentication to dev signing.

## Verification

Run these commands from `apps/frontend`.

```sh
npx tsx --test test/managed-auth*.test.ts
AQUAMUX_AUTH_E2E_ORIGIN=http://127.0.0.1:33127 npx tsx --test test/managed-auth-next.test.ts
npx eslint lib/server/auth/index.ts lib/server/auth/request-origin.ts test/managed-auth-origin.test.ts test/managed-auth-next.test.ts --max-warnings=0
npx tsc --noEmit --incremental false
```

The focused suite passed all five enabled tests, with the live Next browser test skipped when its opt-in origin was absent.
The explicit live Next test passed in Chromium against port 33127 using an ephemeral generated wallet.
It verified challenge and signature authentication, an actual browser GET without Origin and with same-origin fetch metadata returning HTTP 200, and an empty group list for that wallet.
Hostile Origin and forwarding cases returned HTTP 403.
Logout without Origin returned HTTP 403, browser logout returned HTTP 200, and the revoked session subsequently returned HTTP 401.
The test uses no funded key and submits no transaction.
Focused ESLint and frontend TypeScript checking passed.
The first typecheck found a header-fixture inference error in the new live test, which was corrected before the successful rerun.

The adversarial regression suite covers nonloopback URLs, unknown local aliases, suffix hostnames, protocol and port changes, missing or wrong Host, wrong or absent mutation Origin, foreign forwarding values, cross-site metadata, missing bearer authentication, remote configured origins, and revoked sessions.
Existing wallet-proof, one-use challenge, expiry, persistence, and logout tests passed without changes.

## Review handoff

The coordinator was notified to dispatch the mandatory separate code-quality review before integration acceptance.
The review should check the focused helper boundary, conventions, maintainability, and the distinction between the unchanged exact-URL path and the constrained alias exception.
