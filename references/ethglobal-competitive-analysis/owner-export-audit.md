# Authenticated owner export

The existing redacted store export was not exposed by the product API.
The Orca embedded browser reproduced an authenticated GET returning HTTP 404 before this change.
The new `GET /api/managed/export` route derives ownership from the authenticated session and returns the existing credential-redacted export.
It does not accept a requested owner address or expose internal documents, authentication sessions, challenges or signed payload records.
The response uses an attachment filename and private, no-store caching.

## Verification

Run `npx tsx scripts/verify-owner-export-http.ts` through Orca CLI and open the printed loopback URL in the Orca embedded browser.
The fixture seeds two synthetic owners and private internal documents in an isolated memory database.
Click Run export audit to exercise the production route through real HTTP.
The corrected route returned HTTP 200 with only the authenticated owner's `export-fixture-0` group, excluded the other owner's group and private fixture payload, and preserved the attachment and cache headers.
An unauthenticated request returned HTTP 401.
The before/after evidence is `owner-export-browser-evidence.json`.
Formatting and type checking passed.
No unit tests or chain transactions were run.

The app owner has the stable endpoint contract for an Export records download control.
The endpoint is complete; wiring and browser verification of that control belong to the active app integration work.
