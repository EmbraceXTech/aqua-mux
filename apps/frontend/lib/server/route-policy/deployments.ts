import type { PoolDeployment, RouterDeployment } from "./types";

// Add a deployment only after source/runtime comparison and a read-only swap proof.
// A matching address, ABI, or successful API quote alone is insufficient provenance.
export const routerDeployments: Readonly<Record<number, RouterDeployment>> = {
  56: {
    address: "0x111111125421ca6dc452d289314280a0f8842a65",
    codeHash:
      "0x7b9ea7c1da2784fe89f77fb8dba143f593a5ebf5afe45d0970d57007a98233af",
    wrapped: "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c",
    wrappedCodeHash:
      "0xb7d84205eaaf83ce7b3940c6beaad6d22790255e34a9a2b486aa8cdfff118fe6",
    sourceUrl:
      "https://arbitrum.blockscout.com/api/v2/smart-contracts/0x111111125421ca6dc452d289314280a0f8842a65",
    quoter: "0x78d78e420da98ad378d7799be8f4af69033eb077",
    quoterCodeHash:
      "0xb6652d71ca265e7b2b5f066661fec38c8c22eb9a9c17b8a5c0fae62ec401bc55",
  },
  42161: {
    address: "0x111111125421ca6dc452d289314280a0f8842a65",
    codeHash:
      "0xaae25d52ea3e7bbb8cc826b589060f063c7f6ca2c2da88bc9b3b0e0a57bd8fb6",
    wrapped: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
    wrappedCodeHash:
      "0x2d240bb4510ed1acfeaba905eb4bcc4524d63c8ae66e48fcccac55ea714db7a7",
    wrappedImplementation: {
      address: "0x8b194beae1d3e0788a1a35173978001acdfba668",
      codeHash:
        "0x0d1c20f9ed551efe8f402bc9aa1a9b5058f925ec615284c5b4a7a4623c3b2dcd",
    },
    sourceUrl:
      "https://arbitrum.blockscout.com/api/v2/smart-contracts/0x111111125421ca6dc452d289314280a0f8842a65",
    quoter: "0x61ffe014ba17989e743c5f6cb21bf9697530b21e",
    quoterCodeHash:
      "0xd8162b13ba57ce21a146063b10658bda0a3fd15c99f768c86283fce6640858a5",
  },
};

export const poolDeployments: readonly PoolDeployment[] = [
  {
    id: "bnb-wbnb-usdc-500",
    chainId: 56,
    address: "0x5289a8dbf7029ee0b0498a84777ed3941d9acfec",
    codeHash:
      "0xd4bcc329a61f8c2ae56fe2aab69b1635c1289b5a343127f9e49839b2898e16a7",
    token0: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",
    token1: "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c",
    protocol: "uniswap-v3",
    fee: 500,
    sourceUrl:
      "https://developers.uniswap.org/docs/protocols/v3/deployments/v3-bnb-deployments",
  },
  {
    id: "bnb-wbnb-usdt-500",
    chainId: 56,
    address: "0x6fe9e9de56356f7edbfcbb29fab7cd69471a4869",
    codeHash:
      "0x6e1ffbcc13981d8074e41a0b052d2f573cc0604441757219657dae501d1f862d",
    token0: "0x55d398326f99059ff775485246999027b3197955",
    token1: "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c",
    protocol: "uniswap-v3",
    fee: 500,
    sourceUrl:
      "https://developers.uniswap.org/docs/protocols/v3/deployments/v3-bnb-deployments",
  },
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
