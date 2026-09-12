# Inline development review check

Recorded September 12, 2026.

## Prerequisites

- Node.js 22.13 or newer and npm.
- Claude Code installed as `claude`, with an active Claude subscription login for the operating-system user that starts Next.js.
- `NODE_ENV=development`.
- `ETHEREUM_RPC_URL` set to a read-only Ethereum RPC endpoint for the synthetic snapshot.
- `AQUAMUX_AUTH_ORIGIN` set to the loopback app URL.

No Anthropic API key, Docker engine, agent runner, runner URL, or runner token is required.

Start the app on a loopback port, then run the check against that port:

```sh
cd apps/frontend
NODE_ENV=development \
  ETHEREUM_RPC_URL=https://ethereum-rpc.publicnode.com \
  AQUAMUX_AUTH_ORIGIN=http://127.0.0.1:3110 \
  AQUAMUX_DB_PATH="$PWD/.data/inline-review-live.sqlite" \
  node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3110

AQUAMUX_REVIEW_URL=http://127.0.0.1:3110 npm run test:review:live
```

The check creates an ephemeral zero-balance wallet, reads public Ethereum state, requests a `hold` review, and sends no transaction. Remove the temporary SQLite file after stopping the app.

## Redacted result

```json
{
  "passed": true,
  "request": "synthetic zero-balance wallet and read-only Ethereum snapshot",
  "publicTransactions": 0,
  "review": {
    "status": "succeeded",
    "decision": "hold",
    "provider": "claude-code-subscription",
    "model": "sonnet",
    "runtimeVersion": "claude-code-cli-direct",
    "cost": null
  }
}
```

The record omits wallet addresses, prompts, credentials, RPC responses, and model reasoning.
