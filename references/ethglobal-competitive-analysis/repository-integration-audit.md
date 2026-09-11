# Repository integration audit

Prepared September 12, 2026 for task `task_5f3deed57210`, dispatch `ctx_051487425d9e`.
This worker owns only this report.
No feature source, generated file, changelog, or existing dirty file was edited by this worker.
The implementation plan and supplied AGENTS instructions were read.
No additional AGENTS file applies under this report directory.

## Finding

Keep mixed commit `65165830f28e4b98e801864187d49a09c5c184a5` and its descendants.
It is a valid Git commit containing changes from two ownership scopes, with 22 files changed, 1069 insertions and 85 deletions.
The commit title attributes only the registry work, so it must not be treated as an exclusively registry-owned deliverable.
This is an ownership and review accounting problem, with no evidence that the reported collision lost a commit.
Separate review and owner acceptance must cover both scopes before integration acceptance.
Do not rewrite history to improve the title or split the commit.

The initial audit observed HEAD `14de19c` and an empty staged diff.
HEAD advanced through `645c892` and `d7c075d` while the audit ran, so the requested mutation pause was not yet universal.
The coordinator later confirmed those advances were pre-pause checkpoint lag and that workers had acknowledged the pause.
The report checkpoint is `d7c075dd8a439c2da16b971d70baf5453a322cd7`.
This report is a checkpoint of an actively edited checkout, not a claim of a clean final integration.

## History and object evidence

`git fsck --connectivity-only --no-dangling` passed without diagnostics.
`6516583`, `55e5a34`, `bbeee25`, and `14de19c` remain reachable ancestors of the checkpoint HEAD.
The mixed commit's managed-service work is followed by `55e5a342c6e64e26bf19177e47fd9a02456b40ad`, which contains seven files, 248 insertions and 27 deletions.
Later commits retain the original objects and add follow-up changes.
A full reflog search found no reset, rebase, or amend associated with this collision.
The only reset entries found were `reset: moving to HEAD` at the original `427a4ec8dd063bcbbbaef870b20ec7a709b119a5` on September 11 at 23:38:08 and 23:38:21 Bangkok time.
Those precede this implementation run and do not establish a collision recovery reset.
The worker's reported abandoned soft-reset attempt therefore has no corresponding successful HEAD movement in the available reflog.
Git connectivity and ancestry cannot certify the semantic correctness of concurrent feature edits.

The registry scope in `6516583` contains:

```text
apps/frontend/app/api/tokens/validate/route.ts
apps/frontend/lib/server/token-registry-source.ts
apps/frontend/lib/server/token-validation-http.ts
apps/frontend/lib/server/token-validation-limit.ts
apps/frontend/lib/server/token-validation.ts
apps/frontend/lib/token-registry.ts
apps/frontend/test/token-registry-api.test.ts
apps/frontend/test/token-registry-server.test.ts
apps/frontend/test/token-registry.test.ts
references/ethglobal-competitive-analysis/token-registry-results.md
```

The managed-service and automation scope in the same commit contains:

```text
apps/frontend/lib/server/automation/reviews.ts
apps/frontend/lib/server/managed-service/freshness.ts
apps/frontend/lib/server/managed-service/http.ts
apps/frontend/lib/server/managed-service/plans.ts
apps/frontend/lib/server/managed-service/proposals.ts
apps/frontend/lib/server/managed-service/reconciliation.ts
apps/frontend/lib/server/managed-service/review-snapshot.ts
apps/frontend/lib/server/managed-service/snapshot.ts
apps/frontend/lib/server/managed-service/tokens.ts
apps/frontend/test/automation-review.test.ts
apps/frontend/test/managed-freshness.test.ts
apps/frontend/test/managed-token-resolution.test.ts
```

This split follows the dispatched scope and file locations.
It does not replace confirmation from the two owners.

## Starting dirty work

The starting evidence remains available in `/tmp/aquamux-phase0-initial-status.txt` and `/tmp/aquamux-phase0-initial-tracked.patch`.
The [baseline report](dev-baseline-results.md) and [task map](implementation-task-map.md) identify nine tracked changes and eight untracked inputs.
I reconstructed the nine original modified files in a temporary directory by applying the saved patch to revision `427a4ec`.
No patch was applied to the shared checkout.

| Original modified path under apps/frontend | Checkpoint evidence |
| --- | --- |
| app/globals.css | Original patch reverses cleanly; later content also exists. |
| components/aquamux.tsx | Original patch cannot reverse because later integration touches its context; direct comparison retains the pair-chart code. |
| e2e/app.spec.ts | Byte-identical to reconstructed original modified file. |
| lib/config.ts | Original patch reverses cleanly; later content also exists. |
| lib/model.ts | Original patch reverses cleanly; later content also exists. |
| lib/server/plan.ts | Original patch reverses cleanly; later content also exists. |
| lib/strategy.ts | Byte-identical to reconstructed original modified file. |
| test/model.test.ts | Byte-identical to reconstructed original modified file. |
| test/plan-router.test.ts | Original patch reverses cleanly; later content also exists. |

All nine paths remain modified in the working tree.
The eight originally untracked paths still exist, including the chart route, component, model, server, tests and network image.
The original snapshot did not record untracked file contents or hashes, so exact preservation of their original bytes is unverifiable from that snapshot.
The direct `aquamux.tsx` comparison shows managed-workspace navigation, removal of the external Portfolio handoff, and registry token selection changes.
The chart imports, state, and chart rendering remain present in that comparison.
The managed UI owner should accept the intended integration overlap before final release.
This audit does not claim that the entire original dirty overlay is byte-identical.

## Index preservation and local evidence

No staged paths were present at the initial check or report checkpoint.
No existing shared-index entries were cleaned up during the read-only audit.
The coordinator authorized a focused commit of this new report and synchronization of only its new index entry after preservation checks.
Private local evidence is retained under `.git/orca-audit/task_5f3deed57210/` and is not committed.
It includes the initial index binary, staged binary patch, staged path list, status inventory, HEAD, reflog, baseline SHA-256 comparison, direct component comparison, and protocol test results.
These are local recovery aids, not portable release artifacts.
The snapshot may contain local metadata and must not be published wholesale.

The exact report-checkpoint status is:

```text
 M apps/frontend/app/api/quote/route.ts
 M apps/frontend/app/globals.css
 M apps/frontend/components/aquamux.tsx
 M apps/frontend/components/managed/activity-view.tsx
 M apps/frontend/components/managed/bot-workspace.tsx
 M apps/frontend/components/managed/config-editor.tsx
 M apps/frontend/components/managed/controls-view.tsx
 M apps/frontend/components/managed/format.ts
 M apps/frontend/components/managed/managed-workspace.tsx
 M apps/frontend/components/managed/managed.css
 M apps/frontend/components/managed/plan-review.tsx
 M apps/frontend/components/managed/positions-view.tsx
 M apps/frontend/components/managed/proposal-form.tsx
 M apps/frontend/components/managed/strategy-view.tsx
 M apps/frontend/components/managed/token-select.tsx
 M apps/frontend/e2e/app.spec.ts
 M apps/frontend/lib/config.ts
 M apps/frontend/lib/managed-client/api.ts
 M apps/frontend/lib/managed-client/use-managed-actions.ts
 M apps/frontend/lib/managed-client/use-managed-group.ts
 M apps/frontend/lib/managed-client/use-managed-session.ts
 M apps/frontend/lib/managed/lifecycle.ts
 M apps/frontend/lib/model.ts
 M apps/frontend/lib/server/dev-wallet/assets.test.ts
 M apps/frontend/lib/server/dev-wallet/assets.ts
 M apps/frontend/lib/server/dev-wallet/baskets.ts
 M apps/frontend/lib/server/dev-wallet/batch.ts
 M apps/frontend/lib/server/dev-wallet/managed.ts
 M apps/frontend/lib/server/dev-wallet/policy.ts
 M apps/frontend/lib/server/dev-wallet/signer.ts
 M apps/frontend/lib/server/lifecycle/index.ts
 M apps/frontend/lib/server/lifecycle/routes.ts
 M apps/frontend/lib/server/lifecycle/types.ts
 M apps/frontend/lib/server/plan.ts
 M apps/frontend/lib/server/swap.ts
 M apps/frontend/lib/strategy.ts
 M apps/frontend/next-env.d.ts
 M apps/frontend/scripts/verify-fork.ts
 M apps/frontend/scripts/verify-managed-lifecycle.ts
 M apps/frontend/test/lifecycle-fixtures.ts
 M apps/frontend/test/lifecycle.test.ts
 M apps/frontend/test/model.test.ts
 M apps/frontend/test/plan-router.test.ts
 M apps/frontend/test/route-policy.test.ts
 M references/ethglobal-competitive-analysis/automation-api-quality-review.md
 M references/ethglobal-competitive-analysis/final-e2e-results.md
 M references/ethglobal-competitive-analysis/managed-ui-quality-review.md
 M references/ethglobal-competitive-analysis/token-registry-quality-review.md
?? .DS_Store
?? apps/frontend/.data/managed.sqlite
?? apps/frontend/.data/managed.sqlite-shm
?? apps/frontend/.data/managed.sqlite-wal
?? apps/frontend/app/api/chart/route.ts
?? apps/frontend/components/managed/group-controller.tsx
?? apps/frontend/components/managed/observation-view.tsx
?? apps/frontend/components/managed/observed-activity.tsx
?? apps/frontend/components/managed/route-checks.tsx
?? apps/frontend/components/price-range-chart.tsx
?? apps/frontend/e2e/managed-fixtures.ts
?? apps/frontend/e2e/managed-races.spec.ts
?? apps/frontend/e2e/managed.config.ts
?? apps/frontend/e2e/managed.spec.ts
?? apps/frontend/e2e/price-range.spec.ts
?? apps/frontend/lib/managed-client/external-execution.ts
?? apps/frontend/lib/managed-client/numeric-input.ts
?? apps/frontend/lib/managed-client/use-token-search.ts
?? apps/frontend/lib/managed-client/wallet-recovery.ts
?? apps/frontend/lib/price-range.ts
?? apps/frontend/lib/server/charts.ts
?? apps/frontend/lib/server/dev-wallet/compile.test.ts
?? apps/frontend/lib/server/dev-wallet/compile.ts
?? apps/frontend/lib/server/dev-wallet/managed-plan.test.ts
?? apps/frontend/lib/server/dev-wallet/managed-plan.ts
?? apps/frontend/lib/server/dev-wallet/routes.test.ts
?? apps/frontend/lib/server/dev-wallet/routes.ts
?? apps/frontend/lib/server/legacy-token-resolution.ts
?? apps/frontend/public/networks/4663-robinhood-chain.png
?? apps/frontend/scripts/fixtures/lifecycle-aggregation.ts
?? apps/frontend/scripts/verify-lifecycle-routes-fork.ts
?? apps/frontend/test/charts.test.ts
?? apps/frontend/test/legacy-token-integration.test.ts
?? apps/frontend/test/lifecycle-routes.test.ts
?? scripts/dev-agent-config.mjs
?? scripts/dev-agent-process.mjs
?? scripts/dev-agent.mjs
?? scripts/dev-agent.test.mjs
```

The generated `apps/frontend/next-env.d.ts` modification remains untouched.
The local database files and `.DS_Store` are outside worker deliverables.
A later integrator must retain or resolve existing dirty work by ownership rather than trying to make status empty.

## Required commit protocol

Every writer must adopt the same protocol before concurrent commits resume.
A cooperative lock cannot stop a worker that bypasses it.
An isolated index alone prevents staged-file capture but does not serialize HEAD or keep the ordinary index aligned afterward.

1. Agree on an exact repository-relative path manifest and stop edits to those paths for the transaction.
   Require owner and reviewer acceptance for shared or previously dirty paths.
   Do not stage a whole previously dirty file merely because the worker also edited it.
   For a shared file, build an approved patch against current HEAD in the private index and leave the other working-tree changes uncommitted.
2. Resolve the Git common directory using `git rev-parse --path-format=absolute --git-common-dir` and acquire its `orca-commit.lock` with atomic `mkdir`.
   All Git writers, including index-only cleanup, use that same lock.
   If acquisition fails, stop and ask the coordinator which writer owns it.
   Never delete an existing lock based only on elapsed time.
3. After acquiring the lock, record HEAD and the current symbolic branch, the exact staged path set, and a SHA-256 of the ordinary index.
   Copy the index binary and save `git diff --cached --binary` into a private recovery directory with restricted permissions.
   Do not print or publish patch contents.
   If any intended owned path is already staged, stop and obtain its owner's disposition before changing it.
   Unrelated staged paths may remain staged throughout the transaction.
4. Allocate a fresh, nonexistent private index pathname under the common directory, without copying the ordinary index.
   Set `GIT_INDEX_FILE` to its absolute pathname and run `git read-tree HEAD`.
   Every add, diff, and commit command for the transaction must receive that environment variable.
5. Stage only the approved manifest using literal pathspecs, for example `git --literal-pathspecs add -A -- exact/path` with the private-index environment.
   Add `-f` only for a specifically approved ignored report, because `references` is ignored here.
   Use `git apply --cached` with the private index for an approved partial-file patch.
   Never use broad directory staging, `git add .`, `git add -A` without paths, or `git commit -a`.
6. Inspect the private staged diff, run its relevant checks, and compare `git diff --cached --name-only --no-renames -z` with the approved changed-path manifest.
   Refuse unexpected paths, an empty change, generated files, and changelogs.
   Keep paths frozen or verify their expected content hashes against the owner's accepted versions.
7. Confirm that HEAD, branch identity, and the ordinary index still match the values captured under the lock.
   Commit with the private-index environment and a focused message without an agent co-author.
   Leave normal repository hooks enabled.
   If the commit fails, retain the recovery data and inspect HEAD before deciding whether any retry is safe.
8. Verify that the new commit has the captured parent and that `git diff-tree --no-commit-id --name-only --no-renames -r HEAD` matches the approved path manifest.
   Confirm the ordinary index has not changed independently.
   If any invariant fails, stop and escalate without resetting or amending history.
9. A private-index commit leaves old entries in the ordinary index for committed paths.
   Only after explicit authorization for those paths, synchronize them with `git --literal-pathspecs restore --source=HEAD --staged -- exact/path` using the ordinary-index environment, with `GIT_INDEX_FILE` unset.
   This changes only index entries and does not edit working files.
   Never restore the whole index or working tree.
   If authorization is absent, retain the lock and ask the coordinator before releasing a stale ordinary index to other writers.
10. Confirm that unrelated staged entries retain their original mode and blob identity, and that the approved paths have no staged reversal.
    Check working-file hashes for the owned paths and record the new commit SHA and checks.
    Preserve the recovery files, remove only the transaction's temporary index, and release only the lock acquired by this transaction.

The coordinator may instead assign a single worker as commit integrator.
All other workers then deliver exact paths or patches, accepted content hashes, review evidence, and test commands without running any Git mutations.
The integrator uses the same private-index protocol so an unrelated pre-existing staged change cannot enter its commit.
The root coordinator remains a coordinator and does not implement or stage worker changes.

## Protocol validation and acceptance

A temporary Git repository reproduced the end-user failure condition with another worker's staged file and a different unstaged version of that file.
The proposed private-index transaction committed only an owned text edit, binary addition, and deletion.
The ordinary index binary remained unchanged by that commit.
Authorized exact-path synchronization preserved the other worker's staged blob and working bytes.
An existing common-directory lock rejected a second writer.
These checks passed and their result is retained in the private evidence directory.
`git diff --check` also passed on the observed shared checkout.
No feature tests were rerun because this deliverable edits only this audit report.

A separate code-quality reviewer must assess the protocol and report before integration acceptance.
No helper script was added, so there is no new module split or runtime dependency to maintain.
The remaining integration work is owner acceptance of the mixed commit, uniform adoption of the commit protocol, and final feature-scope validation by the separately dispatched integrator.
