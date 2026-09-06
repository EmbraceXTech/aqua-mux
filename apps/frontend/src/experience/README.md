# Cool Bar interactive experience

This is a local React prototype of discovery, research, AI access, wallet review, and portfolio tracking.
All market data, AI requests, payments, and wallet confirmations are simulated.
No API or contract implementation is connected.

Run `bun run dev -- --host 0.0.0.0` from `apps/frontend` and open the displayed URL.
The default app renders `Experience.tsx`.
`experience.html` also provides an isolated development entry point.

Choose the USDC starter, send the editable question, and complete either AI access setup.
Inspect the comparison and evidence, open an opportunity, supply a sample amount, and confirm the separate simulated wallet steps.
The position saves immediately after confirmation.
Select it in Portfolio to explicitly include it in a follow-up request.

Local storage keys start with `coolbar-`.
Clearing browser data removes locally tracked positions, research history, and demo connection settings.
The agent does not receive portfolio context simply because the wallet is connected.

`data.ts` contains sample market observations and the local state types.
`flows.tsx` implements AI setup, evidence inspection, and transaction states.
`primitives.tsx` contains visual controls and the modal focus trap.
`experience.css` provides the responsive light and dark themes.

Run `bun run build` and `bun run lint` for static checks.
Run `bunx playwright test --config playwright.experience.config.ts` for the browser journeys.
The test configuration uses installed Google Chrome and starts the development server when needed.

The remaining components outside this directory were being added by a separate process during implementation and are preserved.
