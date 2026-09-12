# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Managed review integration: `apps/frontend/lib/server/managed-service/runner.ts` invokes the local Claude Code subscription only in development. Run `cd apps/frontend && npm run test:review`; the attended check and prerequisites are in `apps/frontend/verification/INLINE_DEVELOPMENT_REVIEW.md`.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
