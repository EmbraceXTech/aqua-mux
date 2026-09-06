export type Chain = "Ethereum" | "Base" | "Arbitrum"
export type Market = {
  id: string
  asset: string
  protocol: string
  chain: Chain
  apy: number
  history: number[]
  liquidity: number
  tvl: number
  utilization: number
  change: number
  risk: "Standard" | "Elevated"
  kind: "lending" | "pool"
  executable: boolean
  volume?: number
  fees?: number
  feeTier?: string
}

export const SNAPSHOT = "Sep 5, 2026 at 12:00 UTC"
export const DATES = [
  "Aug 30",
  "Aug 31",
  "Sep 1",
  "Sep 2",
  "Sep 3",
  "Sep 4",
  "Sep 5",
]
export const markets: Market[] = [
  {
    id: "aave-base",
    asset: "USDC",
    protocol: "Aave V3",
    chain: "Base",
    apy: 6.84,
    history: [5.92, 6.12, 6.28, 6.45, 6.57, 6.76, 6.84],
    liquidity: 42800000,
    tvl: 186400000,
    utilization: 77.04,
    change: 0.92,
    risk: "Standard",
    kind: "lending",
    executable: true,
  },
  {
    id: "morpho-eth",
    asset: "USDC",
    protocol: "Morpho",
    chain: "Ethereum",
    apy: 7.32,
    history: [6.71, 6.85, 7.04, 6.98, 7.15, 7.24, 7.32],
    liquidity: 18900000,
    tvl: 94300000,
    utilization: 79.96,
    change: 0.61,
    risk: "Elevated",
    kind: "lending",
    executable: false,
  },
  {
    id: "aave-arb",
    asset: "USDC",
    protocol: "Aave V3",
    chain: "Arbitrum",
    apy: 5.61,
    history: [5.28, 5.35, 5.39, 5.48, 5.44, 5.53, 5.61],
    liquidity: 28600000,
    tvl: 142100000,
    utilization: 79.87,
    change: 0.33,
    risk: "Standard",
    kind: "lending",
    executable: true,
  },
  {
    id: "aave-eth",
    asset: "USDC",
    protocol: "Aave V3",
    chain: "Ethereum",
    apy: 4.28,
    history: [4.46, 4.39, 4.41, 4.35, 4.33, 4.3, 4.28],
    liquidity: 382600000,
    tvl: 1240000000,
    utilization: 69.15,
    change: -0.18,
    risk: "Standard",
    kind: "lending",
    executable: true,
  },
  {
    id: "compound-eth",
    asset: "USDC",
    protocol: "Compound V3",
    chain: "Ethereum",
    apy: 4.91,
    history: [4.62, 4.7, 4.75, 4.81, 4.79, 4.87, 4.91],
    liquidity: 86400000,
    tvl: 326800000,
    utilization: 73.56,
    change: 0.29,
    risk: "Standard",
    kind: "lending",
    executable: false,
  },
  {
    id: "aave-usdt",
    asset: "USDT",
    protocol: "Aave V3",
    chain: "Ethereum",
    apy: 4.76,
    history: [4.35, 4.41, 4.49, 4.6, 4.57, 4.7, 4.76],
    liquidity: 246900000,
    tvl: 981400000,
    utilization: 74.84,
    change: 0.41,
    risk: "Standard",
    kind: "lending",
    executable: true,
  },
  {
    id: "uni-base",
    asset: "ETH / USDC",
    protocol: "Uniswap V3",
    chain: "Base",
    apy: 0,
    history: [3.2, 3.9, 3.6, 4.5, 4.1, 4.6, 4.8],
    liquidity: 18200000,
    tvl: 18200000,
    utilization: 0,
    change: 14.6,
    risk: "Elevated",
    kind: "pool",
    executable: false,
    volume: 24600000,
    fees: 73800,
    feeTier: "0.30%",
  },
  {
    id: "uni-eth",
    asset: "ETH / USDC",
    protocol: "Uniswap V3",
    chain: "Ethereum",
    apy: 0,
    history: [7.4, 8.1, 7.6, 8.4, 9.3, 8.8, 9.6],
    liquidity: 142600000,
    tvl: 142600000,
    utilization: 0,
    change: 8.2,
    risk: "Elevated",
    kind: "pool",
    executable: false,
    volume: 189400000,
    fees: 94700,
    feeTier: "0.05%",
  },
  {
    id: "uni-arb",
    asset: "ETH / USDT",
    protocol: "Uniswap V3",
    chain: "Arbitrum",
    apy: 0,
    history: [2.1, 2.4, 2.9, 2.5, 3.1, 3, 3.6],
    liquidity: 9800000,
    tvl: 9800000,
    utilization: 0,
    change: 6.8,
    risk: "Elevated",
    kind: "pool",
    executable: false,
    volume: 12700000,
    fees: 38100,
    feeTier: "0.30%",
  },
]

export const starters = [
  {
    title: "Put your stablecoins to work",
    text: "Compare USDC supply opportunities on Base, Arbitrum, and Ethereum over the last seven days.",
    tag: "Lending",
    icon: "coins",
  },
  {
    title: "Look beyond the headline yield",
    text: "Which Uniswap pools generated the most fees in the last three days, excluding incentive rewards?",
    tag: "Liquidity pools",
    icon: "waves",
  },
  {
    title: "Find the tradeoffs",
    text: "What would I give up if I moved my USDC from Aave on Ethereum to Aave on Base?",
    tag: "Strategy",
    icon: "route",
  },
]

export const average = (values: number[]) =>
  values.reduce((sum, value) => sum + value, 0) / values.length
export const money = (value: number, digits = 2) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)
export const compact = (value: number) =>
  "$" +
  new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value)
export const percent = (value: number) => `${value.toFixed(2)}%`
export const marketById = (id: string) =>
  markets.find((market) => market.id === id)
export const protocolUrl = (protocol: string) =>
  ({
    "Aave V3": "https://aave.com",
    Morpho: "https://morpho.org",
    "Compound V3": "https://compound.finance",
    "Uniswap V3": "https://app.uniswap.org",
  })[protocol] ?? "https://thegraph.com"
