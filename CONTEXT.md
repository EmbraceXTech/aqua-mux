# Project context

## Naming

Keep Cool Bar as the product name.

Use "Cool Bar: Ask, compare, act on DeFi" when a short description is needed.

Other acceptable descriptions are "DeFi research and execution with an agent", "Your DeFi decision desk", and "Agent-guided DeFi investing".

"Agent-assisted DeFi investment platform" is accurate but too long for a landing-page headline.

## First release scope

The first release should optimize for research that leads to a clear, reviewable action.

Use live The Graph data rather than static fixtures.

Start with a small set of Uniswap and 1inch-compatible AMM data sources where available.

Start stablecoin lending research with Aave and add another protocol only when its live data is reliable.

Store chat history and tracked positions in browser local storage for the prototype.

Show a visible notice that clearing browser data removes this local state.

## AI access decisions

Cool Bar supports two research-agent access paths.

Bring your own access uses a local connector that bridges the web app to a supported local agent CLI session.

The connector verifies the bridge with a harmless test prompt before enabling requests.

This path keeps the user's AI credentials and subscription session on their own device.

Paid access uses a Cool Bar-operated agent service with capped usage and visible metering.

The paid path sets a maximum budget before the request, shows an estimated cost before execution, shows the settled cost afterward, and retains a transaction reference or receipt.

The payment path uses an x402-compatible flow on Hedera with the required facilitator.

The app must clearly state the supported CLI tools, account types, and provider terms.

## Deferred capacity marketplace

Do not build or present resale of consumer AI subscriptions as an MVP capability.

Consumer subscription terms commonly prohibit credential sharing, account resale, and delegated use.

A trusted execution environment does not resolve consent, abuse control, provider terms, billing disputes, or accountability.

The long-term alternative is an opt-in marketplace for provider-approved API capacity or dedicated agent endpoints.

A provider could publish a rate limit, price, availability, and permitted models without exposing a reusable credential.

If the marketplace appears in a demo, label it as an architecture concept unless a provider explicitly supports the arrangement.

## Hackathon story

Build one complete story rather than many partial integrations.

The demo is a user who compares stablecoin yield or AMM fee activity from live The Graph data, asks Cool Bar to explain the tradeoff, pays for or brings their own agent request, executes one supported 1inch transaction, and sees the resulting position in their tracked portfolio.

The main prize targets are The Graph, Hedera, and 1inch.

The Graph is the live-data source and supports the natural-language analysis workflow.

Hedera hosts a live x402-protected paid service with an end-to-end paid request on testnet or mainnet.

1inch provides an Aqua or SwapVM-based action with on-chain token movement and a visible resulting position.

Chainlink, ENS, and World are later opportunities unless a small integration strengthens the required user story.

## Prize requirements

The Graph submission must use live data from a Graph provider rather than mock or static data.

The Graph AI track expects more than displaying query results.

Hedera's AI and agentic payments track requires a live x402-protected service on Hedera testnet or mainnet, settlement through Blocky402, and at least one paid request completed end to end.

1inch's Aqua app track requires a custom Aqua application, official Aqua or SwapVM contracts, on-chain token transfers, and a way to demonstrate resulting positions.

The public repository needs setup instructions, architecture documentation, payment-flow documentation, meaningful commit history, and a short demo video.

## Architecture direction

The web app contains the market homepage, chat, result renderer, wallet flow, portfolio view, and agent access settings.

A data service queries supported Graph sources and returns normalized, timestamped protocol facts.

An agent service has tightly scoped tools for querying the data service and generating structured result objects.

The result renderer supports tables, comparisons, charts, source references, risk notices, and transaction action cards.

A payment service protects paid requests with x402 and records budget, settlement, and request metering.

A transaction service constructs supported 1inch actions while the user's wallet signs each transaction.

## Current decisions

Choose the first demo's primary decision type: stablecoin lending or AMM liquidity provision.

Choose the first supported chain or chains.

Define the supported protocols and the live Graph data source for each.

Decide whether paid-agent access is a complete Hedera x402 flow or a narrower payment proof.

Define the one 1inch Aqua or SwapVM position that Cool Bar creates and monitors.

Keep the AI capacity marketplace deferred.

Decide whether identity and strategy-sharing belong in the hackathon submission.

## Known risks

Yield comparisons become misleading when fees, incentive rewards, borrowed and supplied rates, or incompatible time windows are mixed.

Metric definitions need to be strict and visible.

Subgraph coverage, indexing lag, and schema differences may limit which protocols and chains work reliably during the hackathon.

Transaction integration requires exact contract interactions, slippage handling, approvals, wallet UX, and a demonstrable resulting position.

Do not present an unfinished marketplace as a safe credential-sharing system.
