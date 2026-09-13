# Agent instructions

## Orca worktrees

When a user asks an agent to work in an Orca worktree, use Orca rather than creating a Git worktree directly.

1. List the worktrees for this repository with `orca worktree list --repo path:<repository-root> --json`.
2. Check each non-main numbered worktree. A worktree is available only when its display name contains digits only, it has no live Orca terminals, and `git -C <path> status --porcelain` has no output.
3. Reuse the available worktree with the lowest number. Change into its path before editing. Set its Orca status to `in-progress` and update its comment with the assigned task.
4. If none is available, create the lowest unused positive number with `orca worktree create --repo path:<repository-root> --name <number> --setup run --json`. Set its display name to the same number, then work from the returned path.
5. Never remove a worktree. The user removes worktrees manually. When finished, leave the worktree clean or with its task changes intact, set its status to `todo`, and state whether another agent may reuse it.

The Orca setup hook runs `scripts/setup-orca-worktree.sh`. It installs dependencies, copies the main checkout's root `.env` into the new worktree and the frontend directory, then runs the managed-store migration.
