# Auth loopback quality review

## Verdict

Pass for commit `51a3b3a6a4ee83be381edef9f39bb181931b4702`.
The independent review found no blocking correctness, security, module ownership, or maintainability issue in this focused fix.
All four reviewed source and test files matched the committed version during verification.
No source refactor is required for acceptance of this change.

## Scope and ownership

The implementation owner is Orca dispatch `ctx_97be6e6a4428`.
The independent reviewer is Orca dispatch `ctx_ec3542cdc4e8`.
The reviewer owns only this report and made no source edits.
The review covered `apps/frontend/lib/server/auth/index.ts`, `apps/frontend/lib/server/auth/request-origin.ts`, `apps/frontend/test/managed-auth-origin.test.ts`, and `apps/frontend/test/managed-auth-next.test.ts`.
The implementation plan, frontend AGENTS instructions, existing wallet authentication, and the implementation owner's reproduction report supplied context.
Unrelated dirty work, generated files, and changelogs were preserved.

## Code and security findings

The entry point adds one import and expands its URL guard to call a separate, pure predicate only when the URL origin differs from the configured origin.
The 41-line helper has one responsibility and no store, signing, session, or UI dependencies.
Its explicit conjunction is short enough to audit without another module split or configurable proxy abstraction.
The test files separate request-level adversarial coverage from the opt-in actual Next browser integration.

Both URL hostnames must resolve through URL parsing to an allowed loopback hostname, and protocol and port must match.
Host must exactly equal the configured authority, so forwarding metadata cannot choose a trusted origin.
Mutations retain the exact Origin requirement before the alias helper runs.
Originless reads pass the alias exception only for GET or HEAD with same-origin Fetch Metadata.
The helper refuses cross-site and same-site metadata, any Forwarded header, inconsistent forwarded authority or protocol or port, and nonloopback forwarded peers.
Bearer parsing, signature verification, challenge consumption, token hashing, expiry, persistence, and logout code remain unchanged.

The restrictions in the helper apply to the alias exception.
The existing exact-URL branch retains its earlier behavior and does not call this helper.
This is a local prototype compatibility fix, and the review does not establish a remotely published reverse-proxy trust policy.

## Independent verification

The following commands passed from `apps/frontend` on September 12, 2026, Bangkok time.

```sh
npx tsx --test test/managed-auth.test.ts test/managed-auth-http.test.ts test/managed-auth-origin.test.ts
AQUAMUX_AUTH_E2E_ORIGIN=http://127.0.0.1:33127 npx tsx --test test/managed-auth-next.test.ts
npx eslint lib/server/auth/index.ts lib/server/auth/request-origin.ts test/managed-auth-origin.test.ts test/managed-auth-next.test.ts --max-warnings=0
```

All five focused auth tests passed, including wallet proof, concurrent replay refusal, restart persistence, expiry, origin restrictions, bearer absence, and revocation.
The explicit Next browser test passed without skips in a fresh headless Chromium instance.
It authenticated a randomly generated owner through challenge and signature, then observed a browser GET with no Origin and with same-origin Fetch Metadata returning 200 and an empty group list.
Hostile Origin and forwarded header requests returned 403, originless logout returned 403, browser logout returned 200, and the revoked token returned 401.
The coordinator authorized this isolated run on port 33127, and the reviewer did not operate the shared UI page or restart the server.
No funded wallet or transaction was involved.

An additional in-memory helper probe passed fourteen adversarial refusal cases and one allowed originless read.
The refusal cases covered same-site metadata, empty and null Origin strings, comma-separated hostile Host and forwarded Host, a protocol list, a zero-prefixed forwarded port, a remote IPv4-mapped forwarded peer, an empty Forwarded header, wrong URL port, wrong URL protocol, a hostname suffix, and originless OPTIONS and DELETE.
An attempted credential-bearing Request failed in the platform Request constructor before reaching the helper, and the corrected probe asserted that refusal separately.
Focused ESLint passed with zero warnings.
The reviewer did not rerun a full frontend typecheck or unrelated UI suites for this auth-only verdict.

## Remaining work

No change is required within this review scope.
The coordinator retains ownership of broader integration acceptance and unrelated implementation work.
