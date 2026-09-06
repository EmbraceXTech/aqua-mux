export type Market = {
  id: string
  asset: string
  protocol: string
  chain: string
  apy: number
  average: number
  liquidity: string
  utilization: number
  trend: number[]
}
export const markets: Market[] = [
  {
    id: "base-usdc",
    asset: "USDC",
    protocol: "Aave V3",
    chain: "Base",
    apy: 5.24,
    average: 5.08,
    liquidity: "$42.8M",
    utilization: 78,
    trend: [4.88, 5.04, 5.15, 4.97, 5.12, 5.16, 5.24],
  },
  {
    id: "arb-usdc",
    asset: "USDC",
    protocol: "Aave V3",
    chain: "Arbitrum",
    apy: 4.86,
    average: 4.72,
    liquidity: "$68.2M",
    utilization: 72,
    trend: [4.6, 4.68, 4.71, 4.65, 4.77, 4.77, 4.86],
  },
  {
    id: "eth-usdc",
    asset: "USDC",
    protocol: "Aave V3",
    chain: "Ethereum",
    apy: 4.12,
    average: 4.03,
    liquidity: "$284.6M",
    utilization: 65,
    trend: [3.92, 4.0, 4.06, 3.98, 4.07, 4.06, 4.12],
  },
  {
    id: "eth-usdt",
    asset: "USDT",
    protocol: "Aave V3",
    chain: "Ethereum",
    apy: 4.58,
    average: 4.41,
    liquidity: "$192.3M",
    utilization: 74,
    trend: [4.26, 4.35, 4.39, 4.33, 4.45, 4.51, 4.58],
  },
  {
    id: "arb-dai",
    asset: "DAI",
    protocol: "Aave V3",
    chain: "Arbitrum",
    apy: 3.76,
    average: 3.62,
    liquidity: "$18.5M",
    utilization: 61,
    trend: [3.48, 3.57, 3.62, 3.55, 3.66, 3.7, 3.76],
  },
]
export const pools = [
  {
    id: "eth-pool",
    pair: "ETH / USDC",
    chain: "Ethereum",
    tier: "0.05%",
    fees: "$128,420",
    volume: "$256.8M",
    tvl: "$84.2M",
  },
  {
    id: "base-pool",
    pair: "ETH / USDC",
    chain: "Base",
    tier: "0.05%",
    fees: "$46,180",
    volume: "$92.4M",
    tvl: "$24.6M",
  },
  {
    id: "arb-pool",
    pair: "ETH / USDT",
    chain: "Arbitrum",
    tier: "0.30%",
    fees: "$32,640",
    volume: "$10.9M",
    tvl: "$12.8M",
  },
]
export const starters = [
  {
    title: "Put your stablecoins to work",
    text: "Compare USDC yields across three chains.",
    question:
      "Compare USDC supply opportunities on Base, Arbitrum, and Ethereum over the last seven days.",
    icon: "coins",
    tone: "mint",
  },
  {
    title: "Look beyond the headline APY",
    text: "Understand what is driving pool fees.",
    question:
      "Which Uniswap V3 ETH stablecoin pools generated the most fees over the last seven days, excluding incentives?",
    icon: "chart",
    tone: "lavender",
  },
  {
    title: "Find the tradeoffs",
    text: "More yield. But at what cost?",
    question:
      "What would I give up if I moved my USDC from Aave on Ethereum to Aave on Base over the last seven days?",
    icon: "sliders",
    tone: "sand",
  },
]
export type Position = {
  id: string
  marketId: string
  amount: number
  date: string
  reference: string
}
export type Thread = {
  id: string
  question: string
  date: string
  kind: "lending" | "amm"
  context: number
  model: string
  cost: number
}
export type Access = {
  type: "own" | "paid"
  model: string
  budget: number
  spent: number
}
export function readStorage<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(`coolbar-${key}`)
    return value ? (JSON.parse(value) as T) : fallback
  } catch {
    return fallback
  }
}
export function saveStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(`coolbar-${key}`, JSON.stringify(value))
  } catch {
    /* UI remains usable when browser storage is unavailable. */
  }
}
export const money = (value: number) =>
  value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
