# Orca worktrees

Configure this as the repository setup command in Orca:

```sh
bash "$ORCA_WORKTREE_PATH/scripts/setup-orca-worktree.sh"
```

The script copies `$ORCA_ROOT_PATH/.env` into the new worktree root, installs the root, frontend, and Privy package dependencies with `npm ci`, then copies the worktree root `.env` to `apps/aqua-mux-app/.env`. It runs the managed-store migration command, which creates or updates `apps/aqua-mux-app/.data/managed.sqlite`.

Worktrees use positive integer names. Agents reuse the lowest clean, terminal-free numbered worktree. They create the lowest unused number only when none is available. Users remove worktrees manually.
