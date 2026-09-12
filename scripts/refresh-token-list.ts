#!/usr/bin/env npx tsx

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  TOKEN_LIST_CHAIN_IDS,
  fetchTokenLists,
  type TokenListChainId,
} from "../lib/token-list.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultOutputDirectory = resolve(root, "data");

function usage(): void {
  console.error("Usage: npm run refresh-token-list -- [--output-dir <path>] [--chain <id[,id...]>] [--dry-run]");
  console.error("       npm run refresh-token-list -- --self-test");
}

function parseChains(value: string): TokenListChainId[] {
  const values = value.split(",").map((part) => Number(part.trim()));
  if (
    !values.length ||
    values.some(
      (chainId) =>
        !TOKEN_LIST_CHAIN_IDS.includes(chainId as TokenListChainId),
    )
  ) {
    throw new Error(`Unsupported chain. Choose from: ${TOKEN_LIST_CHAIN_IDS.join(", ")}.`);
  }
  return [...new Set(values)] as TokenListChainId[];
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

async function selfTest(): Promise<void> {
  const lists = await fetchTokenLists({
    chainIds: [1, 42161, 4663],
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    fetch: async (input) => {
      const url = String(input);
      if (url.includes("trustwallet")) {
        return jsonResponse({
          tokens: [
            {
              chainId: 1,
              address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
              decimals: 6,
              name: "USD Coin",
              symbol: "USDC",
              logoURI: "https://assets.example/usdc.png",
            },
            { address: "not-an-address", decimals: 18, name: "Bad", symbol: "BAD" },
          ],
        });
      }
      if (url.includes("CamelotLabs")) {
        return jsonResponse([
          {
            chainId: 42161,
            address: "0x912ce59144191c1204e64559fe8253a0e49e6548",
            decimals: 18,
            name: "Arbitrum",
            symbol: "ARB",
          },
        ]);
      }
      if (url.includes("tokens.1inch.io")) {
        return jsonResponse({
          "0xaf88d065e77c8cc2239327c5edb3a432268e5831": {
            chainId: 42161,
            address: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
            decimals: 6,
            name: "USD Coin",
            symbol: "USDC",
            logoURI: "https://assets.example/usdc.png",
          },
          "0x0000000000000000000000000000000000000001": {
            chainId: 42161,
            address: "0x0000000000000000000000000000000000000001",
            decimals: 18,
            name: "Malicious",
            symbol: "BAD",
            tags: ["RISK:malicious"],
          },
        });
      }
      return jsonResponse({
        assets: [
          {
            status: "ASSET_STATUS_ACTIVE",
            tokenName: "Apple • Robinhood Token",
            tokenSymbol: "AAPL",
            logoUrl: "https://cdn.example/aapl.png",
            deployments: [
              { chainId: 4663, contractAddress: "0x1Cdad396DB64BDa184d5182A97Dd9B3C62100b7D" },
            ],
          },
          {
            status: "ASSET_STATUS_INACTIVE",
            tokenName: "Old Token",
            tokenSymbol: "OLD",
            deployments: [
              { chainId: 4663, contractAddress: "0x2Cdad396DB64BDa184d5182A97Dd9B3C62100b7D" },
            ],
          },
        ],
      });
    },
  });
  if (
    lists.length !== 3 ||
    lists[0].list.tokens[0]?.symbol !== "USDC" ||
    lists[0].rejected !== 1 ||
    lists[1].list.tokens.length !== 3 ||
    lists[1].sources.length !== 3 ||
    lists[1].rejected !== 2 ||
    lists[2].list.tokens[0]?.symbol !== "AAPL" ||
    lists[2].list.tokens[0]?.decimals !== 18
  ) {
    throw new Error("Token list self-test failed.");
  }
  console.log("Token list self-test passed.");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--self-test")) {
    if (args.length !== 1) throw new Error("--self-test cannot be combined with other options.");
    await selfTest();
    return;
  }

  let outputDirectory = defaultOutputDirectory;
  let dryRun = false;
  let chainIds: TokenListChainId[] | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--output-dir" || arg === "--chain") {
      const value = args[++index];
      if (!value) throw new Error(`${arg} requires a value.`);
      if (arg === "--output-dir") outputDirectory = resolve(root, value);
      else chainIds = parseChains(value);
    } else {
      usage();
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  const builds = await fetchTokenLists({ chainIds });
  for (const build of builds) {
    const sources = build.sources
      .map((source) => `${source.name}: ${source.accepted} accepted, ${source.rejected} rejected`)
      .join("; ");
    console.log(`${build.chainId}: ${build.list.tokens.length} unique tokens. ${sources}.`);
  }

  if (dryRun) {
    for (const build of builds) {
      console.log(`Dry run: would write ${resolve(outputDirectory, `${build.chainId}.json`)}.`);
    }
    return;
  }
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all(
    builds.map(async (build) => {
      const output = resolve(outputDirectory, `${build.chainId}.json`);
      await writeFile(output, `${JSON.stringify(build.list, null, 2)}\n`, "utf8");
      console.log(`Wrote ${output}.`);
    }),
  );
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Token list refresh failed.");
  process.exitCode = 1;
});
