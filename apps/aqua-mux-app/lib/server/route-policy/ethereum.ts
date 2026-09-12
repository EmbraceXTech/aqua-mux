import type { PoolDeployment, RouterDeployment } from "./types";

// Source/compiler/semantic immutable evidence is retained in fixtures/ethereum.
export const ethereumRouter: RouterDeployment = {
  address: "0x111111125421ca6dc452d289314280a0f8842a65",
  codeHash:
    "0xa5a286be4b80006cc547d7e899871aa01a0e0551e2a509233375405f92098c2f",
  wrapped: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
  wrappedCodeHash:
    "0xd0a06b12ac47863b5c7be4185c2deaad1c61557033f56c7d4ea74429cbb25e23",
  sourceUrl:
    "https://eth.blockscout.com/api/v2/smart-contracts/0x111111125421ca6dc452d289314280a0f8842a65",
  quoter: "0x61ffe014ba17989e743c5f6cb21bf9697530b21e",
  quoterCodeHash:
    "0x06148f47d0f41a68d3bc970030a7150e5d608cfbc28d372440a2e41ce543d92b",
};
export const ethereumPools: readonly PoolDeployment[] = [
  {
    id: "ethereum-weth-usdc-500",
    chainId: 1,
    address: "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640",
    codeHash:
      "0xa981b66c747a3d9fa29d7e200d5faaa2826960523d0e5a0df8148e8868c480b4",
    token0: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    token1: ethereumRouter.wrapped,
    protocol: "uniswap-v3",
    fee: 500,
    sourceUrl:
      "https://eth.blockscout.com/api/v2/smart-contracts/0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640",
  },
  {
    id: "ethereum-weth-usdt-500",
    chainId: 1,
    address: "0x11b815efb8f581194ae79006d24e0d814b7697f6",
    codeHash:
      "0x54f2b4c90d2939269a9d3ea8a3081dce03328c947d54bf3d98b2820922840b35",
    token0: ethereumRouter.wrapped,
    token1: "0xdac17f958d2ee523a2206206994597c13d831ec7",
    protocol: "uniswap-v3",
    fee: 500,
    sourceUrl:
      "https://eth.blockscout.com/api/v2/smart-contracts/0x11b815efb8f581194ae79006d24e0d814b7697f6",
  },
];
