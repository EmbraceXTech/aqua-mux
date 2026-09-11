import { loadEnvFile } from "node:process";
import { validateTokenPair } from "../lib/server/token-registry";

loadEnvFile(".env");

const cases = [
  {
    chainId: 1,
    src: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    dst: "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9",
    amount: "1000000000000000",
  },
  {
    chainId: 56,
    src: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    dst: "0xcf6bb5389c92bdda8a3747ddb454cb7a64626c63",
    amount: "1000000000000000",
  },
  {
    chainId: 42161,
    src: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    dst: "0xfc5a1a6eb076a2c7ad06ed22c90d7e710e35ad0a",
    amount: "1000000000000000",
  },
  {
    chainId: 4663,
    src: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    dst: "0x5fc5360d0400a0fd4f2af552add042d716f1d168",
    amount: "1000000000000000",
  },
] as const;

const results = [];
for (const input of cases) {
  const result = await validateTokenPair(input);
  results.push({
    chainId: result.chainId,
    source: {
      symbol: result.source.symbol,
      address: result.source.address,
      decimals: result.source.decimals,
      metadata: result.metadata.source.status,
    },
    destination: {
      symbol: result.destination.symbol,
      address: result.destination.address,
      decimals: result.destination.decimals,
      metadata: result.metadata.destination.status,
    },
    route: result.route,
  });
}

console.log(
  JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2),
);
