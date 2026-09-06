# Cool Bar research desk

A complete frontend prototype with local sample data.
No backend, AI provider, wallet extension, contract, or payment service is connected.

## Run

From `apps/frontend`:

```sh
bun install
bun run dev:desk
```

Open the `/desk.html` URL shown by Vite.
This entry is separate from the existing app entry so concurrent design work remains intact.

## Try the complete journey

1. Choose a research starter on Discover.
   It fills the composer without sending.
2. Send the question and choose a simulated local subscription or a capped paid allowance.
3. Follow the progress, compare markets, inspect source references, and switch the APY chart to its data table.
4. Choose Review supply and connect a demo wallet.
5. Enter an amount, review the risks, approve the exact token allowance, and confirm the simulated transaction.
6. Open Portfolio and separately allow the view to read tracked positions.
7. Attach positions to a follow-up research question.
   The agent only receives the snapshot explicitly attached to that request.

For the swap flow, ask "Swap ETH to USDC on Base."
The demo supports ETH to USDC on Base with an expiring sample quote and a minimum-received amount.

Transaction dialogs include an optional state-preview control for rejection, wrong-network, insufficient-funds, and simulation-failure recovery.
No position or balance changes before successful simulated confirmation.

## Other screens

Saved opportunities, local activity, AI access management, approved budget changes, wallet controls, and workspace settings are interactive.
Shared capacity is a secondary architecture concept for provider-approved endpoints, not a consumer-subscription resale marketplace.

The interface supports light and dark themes, mobile navigation, keyboard search, dialog focus management, reduced motion, and horizontally scrollable data tables.
Press Command+K or Ctrl+K to search the workspace.
Press N to start research, or / to focus the composer outside an input field.

## Sample boundaries

Lending comparisons use seven daily observations from August 30 to September 5, 2026.
Pool fees cover September 3 to September 5, 2026.
Current APY, period-average APY, and pool trading fees are separate metrics.
Rates exclude incentive rewards.
Unsupported strategies and time windows return a coverage notice instead of invented results.

Paid research uses a sample price of 0.04 USDC per completed request.
It settles only on completion and stops before exceeding the approved allowance.
All charges and receipts are simulated.

Workspace state uses the `coolbar-workspace-v1` browser storage key.
Theme preference uses `coolbar-desk-theme`.
Sharing's local invocation ledger has its own key.
Clearing browser data removes local history and tracking.
The app still opens when browser storage is unavailable, but that session cannot persist changes.

## Checks

```sh
bun run test:desk
bun run build:desk
bun run lint
```

Browser tests use Playwright with locally installed Google Chrome.
The dedicated build writes `dist-desk/desk.html` and its assets.
The implementation starts at `src/desk-main.tsx` and `src/coolbar-desk.tsx`.
