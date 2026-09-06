# Cool Bar

## Working name and positioning

Cool Bar is a working name for an agent-assisted DeFi research and execution app.

The product turns public on-chain and protocol data into clear answers, comparisons, and wallet-confirmed actions.

Alternative names worth considering are Poolside, DeFi Lens, Yield Atlas, LiquiScope, and Vaultwise.

Poolside is short and memorable, but it is narrower than the product because Cool Bar also covers lending and portfolios.

DeFi Lens is the clearest description of the research product.

Yield Atlas is a strong fit if yield discovery becomes the primary homepage experience.

## One-line description

Cool Bar helps people research DeFi opportunities, understand their portfolio, and execute a chosen transaction through an AI agent that works from live public protocol data.

A user can move from a question such as "Which Ethereum USDC lending market had the strongest supply yield this week?" to an evidence-backed result and, if they choose, a transaction they confirm in their own wallet.

## Problem

DeFi data is public, but using it well is still difficult.

Someone researching liquidity pools, lending markets, or their own positions must move between explorers, dashboards, protocol interfaces, and raw GraphQL responses.

The data has different schemas, timestamps, token formats, and chain coverage.

Even when the numbers are available, the user still needs to decide which comparison is fair.

A pool's headline yield may come from short-lived incentives, a narrow observation window, volatile assets, or risk the user did not intend to take.

Existing dashboards mostly leave users to filter tables themselves.

Existing chat interfaces can produce appealing explanations without showing the query, data window, assumptions, or transaction consequences.

Users also face a separate problem when they want to use an AI assistant.

They may already pay for Claude Code or Codex, yet have no simple way to use their own subscription inside a DeFi app.

People without an AI subscription may still want the research experience, but they need a transparent way to pay for each request.

## Product

Cool Bar combines a live DeFi data layer, an AI research agent, wallet-connected execution, and an optional AI access marketplace in one web app.

The agent translates a natural-language question into protocol-specific data queries, normalizes the results, applies a stated comparison method, and returns a practical result such as a table, chart, pool card, or portfolio diagnosis.

The primary data source is The Graph and protocol subgraphs for supported DeFi protocols.

Cool Bar can research and compare any supported DeFi protocol, chain, asset, position type, or investment strategy using public data sources and protocol integrations.

Aave V3 stablecoin supply markets and Uniswap V3 liquidity-pool analysis on Ethereum, Base, and Arbitrum are examples of the initial research experience.

1inch swaps and Aave deposits are examples of supported execution paths.

Every investment-related answer identifies the source protocol, chain, token, time range, calculation method, and material risks.

Cool Bar may suggest an action, but it never trades, deposits, borrows, rebalances, or moves funds without a separate wallet confirmation from the user.

Cool Bar does not provide financial advice or claim that an investment is "best" without first applying the constraints the user gave.

## Primary users

Cool Bar is for DeFi participants who understand the basics of wallets and tokens but do not want to write GraphQL queries or manually compare protocol dashboards.

The first user is likely deciding where to supply stablecoins, provide liquidity, swap an asset, or review positions they already hold.

They want a concise answer, the evidence behind it, and a direct path to act if they agree.

A second user already has an AI subscription and wants to use it inside Cool Bar or share unused capacity for payment.

## Product direction

Cool Bar's goal is to support DeFi research and user-approved interactions across protocols, chains, and investment strategies.

A person should be able to investigate lending, borrowing, liquidity provision, staking, liquid staking, restaking, swaps, bridges, derivatives, vaults, liquidation risk, governance, and their own portfolio through one consistent interface.

Aave V3 stablecoin supply research, Uniswap V3 pool analysis, 1inch swaps, and Aave deposits are concrete examples of the product experience, not limits on the product's eventual coverage.

Every result identifies its supported protocol, chain, source, observation time, and known coverage limits.

When an interaction is supported, Cool Bar prepares the relevant transaction or transaction sequence for the user to review and confirm in their own wallet.

A connected wallet enables transaction signing.

The agent receives portfolio context only after the user explicitly includes it in a request.

Cool Bar can offer a shared AI-access network through provider-controlled local runtimes, metered availability, earnings records, and the ability to stop sharing at any time.

The system must protect reusable credentials and must not treat encryption alone as a solution to credential security or provider trust.

## Core product loop

1. A user opens Cool Bar and sees live stablecoin supply opportunities and AMM research prompts.
2. They choose a starter question or enter their own question.
3. Before sending the first request, they choose how the agent should run.
4. They either connect their own local AI CLI subscription or select paid access with a maximum budget.
5. The agent queries relevant supported protocol data and applies an explicit comparison method.
6. Cool Bar streams the agent's progress, including the sources and analysis steps being used.
7. Cool Bar returns an answer with sources, a data timestamp, result artifacts, assumptions, and risks.
8. When the user chooses a supported opportunity or interaction, Cool Bar presents action cards for the relevant swap, deposit, withdrawal, liquidity, bridge, or other protocol transaction.
9. The user reviews and confirms each transaction through their connected wallet.
10. Cool Bar stores the resulting tracked position in local browser state and shows it in the portfolio view.
11. On later visits, the user can choose to include tracked positions in a new research request.

## Homepage and discovery

The homepage presents understandable opportunities and research ideas rather than generic market statistics.

It can show stablecoin supply markets with supply APY, available liquidity, utilization, chain, and data age.

It can show active AMM pools with recent fees, trading volume, total value locked, fee tier, chain, and a clear reminder that fees are not net returns.

It can show yield changes, liquidation-risk signals, and starter prompts that turn a module into a research question.

Cool Bar does not show total portfolio value until the user connects a wallet and explicitly asks the app to read it.

Useful starter questions include:

- "Show the top USDC lending markets on Ethereum by supply APY over the last seven days."
- "Which Uniswap pools generated the most fees in the last three days, excluding incentive rewards?"
- "Compare USDC supply opportunities on Base, Arbitrum, and Ethereum."
- "Find high-volume ETH stablecoin pools with at least $1 million in TVL."
- "Which of my tracked positions changed the most since I opened them?"
- "What would I give up if I moved my USDC from Aave to the highest-yield supported market?"

Selecting a starter question places it in the chat composer so the user can edit it before they send it.

## Agent chat and result experience

Users can start a new chat, revisit previous chat threads, and select a supported model through their chosen AI access method.

A chat preserves its questions, source references, analysis artifacts, and action cards.

The agent progress view should make work visible without overwhelming the user.

It can show stages such as understanding the request, fetching supported protocol data, comparing candidates, checking constraints, and preparing a result.

The final answer separates facts, calculations, assumptions, and optional recommendations.

Each result includes the data sources, observation time, selected time range, calculation method, comparable candidates, and caveats.

Cool Bar uses a table when the user needs to compare several opportunities.

It uses a chart only when the chart makes a trend or comparison easier to understand.

It uses a custom action card when the user can take a supported next step.

## Live protocol research

Cool Bar queries live protocol data and normalizes token units, chain identifiers, timestamps, time windows, and comparable metrics before ranking results.

For an AMM pool, Cool Bar distinguishes trading fees from token incentives.

It shows recent fee generation, volume, TVL, fee tier, chain, token pair, and the chosen measurement period.

It also explains relevant concerns such as impermanent loss, asset volatility, liquidity depth, incentive expiry, and smart-contract risk.

For a lending market, Cool Bar shows supply APY, included incentives, utilization, available liquidity, supported collateral context where relevant, chain, and the time at which the data was observed.

The agent should ask a clarifying question when a request lacks a decision-critical constraint, such as chain, asset, time window, or tolerance for volatile assets.

For the hackathon version, the agent can use a defined supported-protocol list rather than claiming universal DeFi coverage.

## AI access methods

Cool Bar offers two paths for running an agent request.

### Use your own subscription

A user who already has Claude Code or Codex installed locally can connect Cool Bar to their existing CLI-based subscription.

The app presents a one-line runtime connection command that the user runs on their own device.

After the local runtime connects, Cool Bar sends a lightweight verification request to confirm that the selected CLI is reachable and authorized.

The user then selects the available model and confirms that Cool Bar should use their own subscription for future requests.

This path uses the user's existing subscription and usage limits.

Cool Bar should show connection state, selected provider, selected model, and any request limits that the local runtime reports.

### Pay to use shared access

A user without a local subscription can choose paid access before sending a request.

They set a maximum spend, such as 10 USDC, then confirm the budget.

Cool Bar must show the estimated price or pricing basis before running the request when it can do so.

The system caps spend at the approved maximum and reports the settled amount afterward.

The payment flow can use x402-compatible payment requests and Hedera-based settlement for the hackathon prototype.

The paid path should feel like the owned-subscription path after setup.

The user asks a question, sees progress, receives the answer, and can act through their wallet when a supported action is available.

## Shared AI access

People with unused AI subscription capacity can opt in to share access through Cool Bar.

They select the supported local subscription or runtime they want to make available and explicitly turn sharing on.

They can set availability and any supported spending or usage limits.

The platform records usage, settled payments, and earnings for that shared connection.

A dedicated sharing page shows active shared connections, total earnings, recent invocations, payment status, and a transaction list.

The provider can turn sharing off at any time.

A provider connects through a local runtime and controls whether their available subscription capacity is shared.

The system exposes connection state, request availability, metered usage, payment status, earnings, and sharing controls without exposing reusable provider credentials to Cool Bar.

The intended architecture uses a trusted execution environment and attestation to isolate runtime operations and prove the state of the environment that handles them.

The product must not describe encryption alone as a solution to credential security or provider trust.

Chainlink may support trusted-runtime or verification parts of this architecture if it fits the final technical design.

## Wallet-connected execution

Cool Bar creates an action card only when it can construct a specific transaction from a supported protocol integration.

The action card identifies the protocol, chain, asset, amount, expected outcome, estimated cost where available, and relevant risks before the user opens their wallet.

The user can change the amount before preparing the transaction.

For swaps, Cool Bar can use 1inch Aqua and 1inch SwapVM integrations where the submitted transaction matches their supported flows.

The wallet remains the final authority for every on-chain transaction.

Cool Bar never asks for a wallet seed phrase or private key.

The product should handle rejection, simulation failure, insufficient funds, incorrect network, and pending transaction states clearly.

## Portfolio monitoring

The portfolio view groups tracked positions by protocol and chain.

Each item shows the asset, deposited or supplied amount, transaction reference, local tracking status, current status when refreshed, and a link to the source protocol.

Cool Bar can persist positions in local browser storage after a user-approved transaction and label this clearly as local tracking.

The full product indexes wallet activity and reconciles positions from supported protocols so users can monitor a complete portfolio rather than only transactions initiated through Cool Bar.

The agent can use tracked position context only when the user explicitly includes it in a request.

Connecting a wallet alone does not grant the agent access to portfolio data.

Users can ask how a position has changed, compare it with current alternatives, or request a possible rebalance analysis.

Cool Bar may explain tradeoffs and prepare a transaction, but it does not automatically rebalance a portfolio.

## Trust rules

Cool Bar clearly separates facts, calculations, assumptions, and recommendations.

It shows the sources and time windows behind a result.

It does not silently include portfolio data in an agent prompt.

It does not retain a wallet private key, seed phrase, reusable AI credential, or raw payment secret.

It does not execute a financial transaction without explicit wallet confirmation.

It caps paid-agent costs before running a request and shows the settled cost afterward.

It makes data freshness visible because DeFi metrics change quickly.

It warns when a result relies on incomplete chain coverage, stale data, unsupported assumptions, or a metric that is not comparable across candidates.

## Hackathon integration plan

ETHOnline 2026 permits at most three sponsor prize tracks per submission.

The strongest three for the first submission are The Graph, Hedera, and 1inch.

The Graph provides public DeFi data ingestion through protocol subgraphs and GraphQL queries.

Hedera supports the payment and settlement story for paid agent access, including x402-style per-request payment.

1inch supports wallet-confirmed swaps and supported transaction execution.

Chainlink is still relevant for a trusted runtime or verification design, but it is not required for the first three prize tracks.

ENS and World can become an identity layer for a later community feature, such as published strategy research or reusable agent prompts.

Those features are outside the core loop for the first build.

## Initial examples and product expansion

Aave V3 research, Uniswap V3 research, 1inch swaps, Aave deposits, Ethereum, Base, and Arbitrum are the initial examples that demonstrate the product.

They do not define the product boundary.

Cool Bar expands through additional public data sources, protocol integrations, chains, assets, position types, and transaction flows.

Every expansion must preserve the same standards for source evidence, calculation transparency, explicit portfolio-context controls, spending limits, and user-confirmed wallet execution.

The ETHOnline submission can demonstrate a stablecoin supply question, a 1inch swap when needed, an Aave deposit, and a later portfolio question as one clear example of the broader product.
