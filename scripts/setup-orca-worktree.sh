#!/usr/bin/env bash
set -euo pipefail

: "${ORCA_ROOT_PATH:?ORCA_ROOT_PATH is required}"
: "${ORCA_WORKTREE_PATH:?ORCA_WORKTREE_PATH is required}"

source_env="$ORCA_ROOT_PATH/.env"
worktree_env="$ORCA_WORKTREE_PATH/.env"

if [[ ! -f "$source_env" ]]; then
  echo "Missing source environment file: $source_env" >&2
  exit 1
fi

cp "$source_env" "$worktree_env"

npm --prefix "$ORCA_WORKTREE_PATH" ci
npm --prefix "$ORCA_WORKTREE_PATH/apps/aqua-mux-app" ci
npm --prefix "$ORCA_WORKTREE_PATH/apps/privy-delegation" ci
npm --prefix "$ORCA_WORKTREE_PATH" run sync:app-env
npm --prefix "$ORCA_WORKTREE_PATH/apps/aqua-mux-app" run migrate

echo "Orca worktree setup complete: ${ORCA_WORKSPACE_NAME:-worktree}"
