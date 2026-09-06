# Cool Bar UI/UX design brief

Create a high-fidelity, responsive, clickable product design for Cool Bar in Claude Design.
Use PROJECT.md as the product specification.
This is a product workspace, not a marketing landing page.
Keep the name Cool Bar and use "Ask, compare, act on DeFi" as the short description.

## Product and visual direction

Cool Bar helps people research supported DeFi opportunities, compare the evidence, and review a transaction before confirming it in their own wallet.
The main design should feel like a carefully edited research desk, with room to read and enough density to compare markets.
Avoid a generic crypto dashboard, decorative market statistics, neon gradients, glass panels, oversized hero sections, and unrelated price charts.

Use a light-first palette with warm off-white page backgrounds, white work panels, near-black text, quiet borders, and a restrained deep teal action accent.
Provide a matching dark theme using charcoal backgrounds and independently checked text and control contrast.
Use a readable sans-serif family, tabular numerals for financial values, and monospace only for addresses, query fragments, and transaction references.
Prefer compact navigation, clear section hierarchy, moderate corner radii, and minimal shadows.
Use protocol and chain labels alongside any icons so recognition does not depend on logos or color.

Design the desktop at 1440px and a usable mobile layout at 390px.
Use a persistent desktop sidebar with Discover, Research, Portfolio, and AI access.
Keep recent research threads below primary navigation.
Put the shared-access concept in a separate secondary section.
On mobile, use compact navigation and full-screen detail views instead of squeezing desktop side panels into the viewport.

## Screen set

### Discover

Lead with "What would you like to understand?" and an editable research composer.
Show useful starter questions and current opportunity modules below it.
Selecting a starter must fill the composer without sending the question.

Include stablecoin supply and AMM research tabs with chain, asset, and time-window controls.
Use a table for stablecoin comparison with protocol, chain, asset, supply APY, incentive inclusion, available liquidity, utilization, and observation time.
Clearly distinguish current supply APY from an average over a selected period.
For AMM pools show token pair, protocol, chain, fee tier, fees earned during the chosen period, volume, and TVL.
Place "Trading fees are not net returns" beside the AMM results.
Do not rank AMM fees and lending APY in one list.

Include a source coverage disclosure, stale-data treatment, loading skeletons, and an empty result state with a filter reset.
Do not show portfolio value on the public homepage.
Use Aave V3 and Uniswap V3 on Ethereum, Base, and Arbitrum as examples, not a claim of universal coverage.
All prototype financial figures must carry a visible "Sample data" label.
A prototype must never claim its figures are live or verified.

### Research workspace

Provide an active research thread and preserved history containing questions, source references, comparison artifacts, and action cards.
The main example question is "Compare USDC supply opportunities on Base, Arbitrum, and Ethereum over the last seven days."
Show editable constraints and a compact progress disclosure with stages such as fetching supported data, comparing candidates, and checking constraints.
Show completed and current stages, source counts, and recoverable errors without presenting hidden model reasoning.

Present the final answer in readable sections for observed facts, calculations, assumptions, risks, and an optional next step.
Use a comparison table as the main result.
Include source protocol, chain, token, data window, observation time, methodology, incentive treatment, and known coverage gaps.
Provide an evidence drawer with source references and an inspectable example query clearly labeled as illustrative.
If a candidate lacks comparable history, exclude it from the ranking and explain why rather than inventing data.

Include one optional seven-day supply APY line chart only where it helps explain the comparison.
Label the unit and exact date range.
Use one scale, persistent series identities, a legend, direct end labels when space allows, hover and keyboard-accessible values, and a table alternative.
Never use a dual axis.
Do not encode chain identity with status colors.
Validate categorical palettes for light and dark backgrounds and avoid color-only distinctions.

Place model and AI-access status near the composer.
Portfolio context is off by default and must be explicitly included for each request.
When included, show a removable context chip with the number of tracked positions.
Connecting a wallet alone must not attach portfolio data.
A question missing a decision-critical constraint should show a short clarification UI before research begins.

### AI access setup and settings

Intercept the first Send action with AI access setup while preserving the draft question.
Offer "Use my subscription" and "Pay per request" with clearly different setup requirements.
Both paths return to the same research interface afterward.

For owned access, show supported local CLI choices, the runtime connection step, a harmless verification step, available model selection, and reported usage limits.
Show disconnected, connecting, verifying, connected, expired authorization, and runtime-unavailable states.
Do not invent a runnable installation command or package name.
Until a verified connector command exists, show the connection step as a labeled prototype rather than a command the user might run.
Explain that reusable AI credentials stay on the user's device.
Do not ask the user to paste a credential or session token.

For paid access, show the pricing basis or estimate, an editable maximum budget in USDC, and explicit budget approval before the request starts.
If the price is unavailable, do not imply an exact estimate.
Separate research costs from protocol transaction costs.
Show a spending-cap interruption, payment rejection, settlement pending, and completed receipt with settled amount and transaction reference.
Any Hedera or x402 flow is a prototype unless connected to an implemented service.
No actual charge or wallet authorization should occur in the design prototype.

### Opportunity and transaction review

Open an opportunity detail panel from a result row.
Show the same evidence and risks plus a supported action such as supplying USDC to Aave.
Allow editing the amount before preparing the transaction.
If a swap is necessary, show the supported 1inch swap as a separate step before the deposit.
Do not assume an ordinary swap is compatible with every Aqua or SwapVM integration.
Do not offer executable actions for unsupported integrations.

The review must identify protocol, chain, assets, amount, destination, expected outcome, estimated network and protocol costs where available, and relevant risks.
A swap review also includes slippage, minimum received, and quote validity.
A token approval is a distinct step and clearly states the spender and allowance.
Any required network switch must happen before the correct-network transaction can proceed.

Use separate Prepare, Review, and Confirm in wallet stages.
The wallet is the final authority for every approval and transaction.
No autonomous execution or rebalance.
Show wrong network, insufficient funds, simulation failure, rejected signature, expired quote, pending transaction, and confirmed transaction states with appropriate recovery actions.
Preserve already completed steps when a later transaction fails.
In the prototype, label the simulated wallet handoff and simulated success clearly.
Never collect a private key or seed phrase.

### Portfolio

Design a disconnected state, connected-but-not-read state, empty local tracking state, and a populated tracked-position view.
Ask for explicit permission before reading the wallet.
Keep wallet reading separate from permission to include positions in an agent request.

Group tracked positions by protocol and chain.
Each position shows asset, amount supplied or deposited, transaction reference, local tracking label, current status if refreshed, last refresh time, and a link to the source protocol.
Show "Tracked in this browser" and explain that clearing browser data removes locally stored positions and chat history.
Do not imply the prototype has reconciled the user's complete on-chain portfolio.

Provide selectable positions and an "Include in research" action that opens an editable question with visible context chips.
A proposed rebalance leads to reviewable action cards, never automatic execution.

### Shared-access concept

PROJECT.md includes shared AI access, while CONTEXT.md explicitly defers resale of consumer subscription capacity from the MVP.
Include a separate screen labeled "Architecture concept" for provider-approved API capacity or dedicated agent endpoints.
Do not present consumer subscription resale as available or permitted.

Show example connection availability, permitted models, metered invocations, usage limits, settlement state, earnings records, and a provider-controlled sharing switch.
Clearly label all figures and interactions as conceptual.
An off switch stops accepting new work and explains what happens to in-flight requests.
Do not claim that encryption or a trusted execution environment alone resolves provider trust, consent, or provider terms.

## Clickable prototype journey

Make this journey navigable without a backend:

1. Open Discover, choose a USDC comparison starter, and edit the question.
2. Send, choose an AI-access path, and review its setup or spending cap.
3. View staged research progress and the comparison result.
4. Inspect evidence, methodology, and an opportunity.
5. Edit an action amount and review the simulated transaction sequence.
6. Open the clearly labeled simulated wallet handoff and view pending, rejection, or success states.
7. On simulated confirmation, find the position in local tracking.
8. Explicitly select that position for a follow-up research question.

Also make filters, tabs, source drawers, theme controls, model selection, navigation, dismissible context chips, and error recovery controls behave consistently.
Avoid dead buttons.
Provide an accessible way to preview important error states without confusing them with actual service failures.

## Accessibility and acceptance checks

Use semantic controls, visible keyboard focus, readable contrast, named icon buttons, associated form labels, and textual status descriptions.
Respect reduced motion and do not use animation as the only signal of progress.
Dialogs must keep focus inside while open, close with Escape where safe, and return focus to the trigger.
Wide tables scroll inside their own container without horizontal page overflow.
Mobile comparison rows must retain protocol, chain, asset, metric definition, and freshness context.

The finished design must make these distinctions unmistakable: sample versus live data, facts versus assumptions, current APY versus period averages, AMM fees versus net returns, wallet connection versus portfolio access, research budget versus transaction cost, and transaction preparation versus wallet confirmation.
Provide the actual Claude Design project link when creation and visual review are complete.
