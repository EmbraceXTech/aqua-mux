import { arbitrum, bsc, mainnet } from "viem/chains";
import { defineChain } from "viem";
import type { Network } from "../types/network.ts";

const robinhood = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [] } },
  blockExplorers: {
    default: { name: "Robinhood Explorer", url: "https://explorer.robinhood.com" },
  },
});

export const networks: readonly Network[] = [
  {
    name: "Ethereum",
    chain: mainnet,
    rpcEnv: "ETHEREUM_RPC_URL",
    tokenApiNetwork: "mainnet",
    alchemyHost: "eth-mainnet.g.alchemy.com",
    tokens: [
      { symbol: "WETH", address: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2" },
      { symbol: "USDC", address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" },
      { symbol: "USDT", address: "0xdac17f958d2ee523a2206206994597c13d831ec7" },
    ],
  },
  {
    name: "Arbitrum",
    chain: arbitrum,
    rpcEnv: "ARBITRUM_RPC_URL",
    tokenApiNetwork: "arbitrum-one",
    alchemyHost: "arb-mainnet.g.alchemy.com",
    tokens: [
      { symbol: "WETH", address: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1" },
      { symbol: "USDC", address: "0xaf88d065e77c8cc2239327c5edb3a432268e5831" },
      { symbol: "USDT", address: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9" },
    ],
  },
  {
    name: "Robinhood Chain",
    chain: robinhood,
    rpcEnv: "ROBINHOOD_RPC_URL",
    alchemyHost: "robinhood-mainnet.g.alchemy.com",
    tokens: [
      { symbol: "WETH", address: "0x0bd7d308f8e1639fab988df18a8011f41eacad73" },
      { symbol: "USDG", address: "0x5fc5360d0400a0fd4f2af552add042d716f1d168" },
      { symbol: "PONS", address: "0x39dbed3a2bd333467115de45665cc57f813c4571" },
    ],
  },
  {
    name: "BNB Chain",
    chain: bsc,
    rpcEnv: "BNB_RPC_URL",
    tokenApiNetwork: "bsc",
    alchemyHost: "bnb-mainnet.g.alchemy.com",
    tokens: [
      { symbol: "WBNB", address: "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c" },
      { symbol: "USDC", address: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d" },
      { symbol: "USDT", address: "0x55d398326f99059ff775485246999027b3197955" },
    ],
  },
];
