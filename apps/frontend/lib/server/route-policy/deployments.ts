import type { PoolDeployment, RouterDeployment } from "./types";

// Add a deployment only after source/runtime comparison and a read-only swap proof.
// A matching address, ABI, or successful API quote alone is insufficient provenance.
export const routerDeployments: Readonly<Record<number, RouterDeployment>> = {
  42161: {
    address: "0x111111125421ca6dc452d289314280a0f8842a65",
    codeHash:
      "0xaae25d52ea3e7bbb8cc826b589060f063c7f6ca2c2da88bc9b3b0e0a57bd8fb6",
    wrapped: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
    sourceUrl:
      "https://arbitrum.blockscout.com/api/v2/smart-contracts/0x111111125421ca6dc452d289314280a0f8842a65",
    quoter: "0x61ffe014ba17989e743c5f6cb21bf9697530b21e",
  },
};

export const poolDeployments: readonly PoolDeployment[] = [
  {
    id: "arbitrum-weth-usdc-500",
    chainId: 42161,
    address: "0xc6962004f452be9203591991d15f6b388e09e8d0",
    codeHash:
      "0xb9d899dac136c1f5179e1987328abb4c9f1ac0abf027ca0ad81750300996af6c",
    token0: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
    token1: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
    protocol: "uniswap-v3",
    fee: 500,
    sourceUrl:
      "https://arbitrum.blockscout.com/api/v2/smart-contracts/0xc6962004f452be9203591991d15f6b388e09e8d0",
  },
  {
    id: "arbitrum-weth-usdt-500",
    chainId: 42161,
    address: "0x641c00a822e8b671738d32a431a4fb6074e5c79d",
    codeHash:
      "0xcb4fd3eda26a91b42746fec7e81473d90e8eb1137b493ebf9f80346a2bae8d3b",
    token0: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
    token1: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9",
    protocol: "uniswap-v3",
    fee: 500,
    sourceUrl:
      "https://arbitrum.blockscout.com/api/v2/smart-contracts/0x641c00a822e8b671738d32a431a4fb6074e5c79d",
  },
];
