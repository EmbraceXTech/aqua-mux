import type { Address, Hex } from "viem";

export const directChainId = 4663;
export const directWrapped =
  "0x0bd7d308f8e1639fab988df18a8011f41eacad73" as Address;
export const directFactory =
  "0x8bceaa40b9acdfaedf85adf4ff01f5ad6517937f" as Address;
export const directDependencies: readonly {
  address: Address;
  codeHash: Hex;
  implementation?: Address;
}[] = [
  {
    address: "0x0bd7d308f8e1639fab988df18a8011f41eacad73",
    codeHash:
      "0x5706be52f64875fee65a2cec0d80e47a23d8793cbe85d214b48445e2d05f5353",
    implementation: "0xc6b81b429797e0f555440b70cd99e032d7ae947e",
  },
  {
    address: "0xc6b81b429797e0f555440b70cd99e032d7ae947e",
    codeHash:
      "0xbe1295f37be34ffe03ad779bda0ef278907e1856b51a3be2f35ee541d75d4650",
  },
  {
    address: "0x5fc5360d0400a0fd4f2af552add042d716f1d168",
    codeHash:
      "0x864cc9ad53b338b82da1f7cab85ab0b3d5c8861acb422b6fec63cf36234f36a6",
    implementation: "0x68184c449e1a8f34fa18d289737129fd27b66f8f",
  },
  {
    address: "0x68184c449e1a8f34fa18d289737129fd27b66f8f",
    codeHash:
      "0x3a551ac5c744af57e68a1d1431ac403c0f516ffd7d224a75746aee11fc4f3baf",
  },
  {
    address: "0x39dbed3a2bd333467115de45665cc57f813c4571",
    codeHash:
      "0x16c3d3ede897688ddff79262606f13bead398332e65001f192460fbac4e1fb85",
  },
  {
    address: "0x8bceaa40b9acdfaedf85adf4ff01f5ad6517937f",
    codeHash:
      "0xbab145d02e7005f0d84c6c1639d39b799b0ea16df99ebbdaf5a14d9da820b4e0",
  },
  {
    address: "0x8803c117ccae7b5146297876c2a25df135141c4d",
    codeHash:
      "0x5b83bdbcc56b2e630f2807bbadd2b0c21619108066b92a58de081261089e9ce5",
  },
  {
    address: "0x8018ee3ad3c0321be0e69536733cd28e29564dd4",
    codeHash:
      "0x5b83bdbcc56b2e630f2807bbadd2b0c21619108066b92a58de081261089e9ce5",
  },
];
export const directPools: readonly {
  id: string;
  address: Address;
  token0: Address;
  token1: Address;
  factory: Address;
}[] = [
  {
    id: "robinhood-weth-usdg",
    address: "0x8803c117ccae7b5146297876c2a25df135141c4d",
    token0: "0x0bd7d308f8e1639fab988df18a8011f41eacad73",
    token1: "0x5fc5360d0400a0fd4f2af552add042d716f1d168",
    factory: "0x8bceaa40b9acdfaedf85adf4ff01f5ad6517937f",
  },
  {
    id: "robinhood-weth-pons",
    address: "0x8018ee3ad3c0321be0e69536733cd28e29564dd4",
    token0: "0x0bd7d308f8e1639fab988df18a8011f41eacad73",
    token1: "0x39dbed3a2bd333467115de45665cc57f813c4571",
    factory: "0x8bceaa40b9acdfaedf85adf4ff01f5ad6517937f",
  },
];
export const restrictionEndBlock = 25526532n;
