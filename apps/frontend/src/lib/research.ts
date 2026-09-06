import { average, markets } from "./demo-data"
import type { ResearchMessage } from "./workspace"

export function prepareResearch(
  prompt: string
): Pick<ResearchMessage, "kind" | "marketIds"> {
  const question = prompt.toLowerCase()
  if (/portfolio|my (tracked )?positions|my holdings/.test(question))
    return { kind: "portfolio", marketIds: [] }
  if (/swap|exchange .*eth|convert .*eth/.test(question))
    return { kind: "swap", marketIds: ["aave-base"] }
  if (
    /restak|staking|stake |bridge .*to|borrow |liquidat|governance|bitcoin|solana|derivative/.test(
      question
    )
  )
    return { kind: "unsupported", marketIds: [] }
  const kind = /uniswap|liquidity pool|amm|impermanent|trading fees/.test(
    question
  )
    ? "pool"
    : "lending"
  if (
    /last (30|90|365|thirty|ninety)|this month|last month|this year|last year/.test(
      question
    ) ||
    (kind === "pool" &&
      /(?:seven|7|thirty|30)[ -]day|last week/.test(question)) ||
    (kind === "lending" && /(?:three|3|thirty|30)[ -]day/.test(question))
  )
    return { kind: "unsupported", marketIds: [] }
  const namedChains = ["ethereum", "base", "arbitrum"].filter((chain) =>
    question.includes(chain)
  )
  const namedProtocols = ["aave", "morpho", "compound", "uniswap"].filter(
    (protocol) => question.includes(protocol)
  )
  const assets = ["usdc", "usdt"].filter((asset) => question.includes(asset))
  const candidates = markets.filter(
    (market) =>
      market.kind === kind &&
      (!namedChains.length ||
        namedChains.includes(market.chain.toLowerCase())) &&
      (!namedProtocols.length ||
        namedProtocols.some((protocol) =>
          market.protocol.toLowerCase().includes(protocol)
        )) &&
      (assets.length
        ? assets.some((asset) => market.asset.toLowerCase().includes(asset))
        : kind === "pool" || market.asset === "USDC")
  )
  const sorted = candidates.sort((a, b) =>
    kind === "pool"
      ? (b.fees ?? 0) - (a.fees ?? 0)
      : average(b.history) - average(a.history)
  )
  return { kind, marketIds: sorted.map((market) => market.id) }
}
