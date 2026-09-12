#!/usr/bin/env npx tsx

import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { networks } from "../lib/constants/networks.ts";
import { balancesFor } from "../lib/wallet-balance.ts";
import { walletAddress } from "../lib/utils/wallet-address.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, ".env");

function usage() {
  console.error(
    "Usage: npx tsx scripts/check-wallet-balance.ts <ENV_VARIABLE_NAME>",
  );
  console.error(
    "The named value in the repository root .env must be an Ethereum private key or wallet address.",
  );
}

async function main() {
  const variableName = process.argv[2];
  if (!variableName || process.argv.length !== 3) {
    usage();
    process.exitCode = 1;
    return;
  }

  const loaded = config({ path: envPath, processEnv: {}, quiet: true });
  if (loaded.error || !loaded.parsed) {
    console.error("Could not read the repository root .env file.");
    process.exitCode = 1;
    return;
  }
  const env = loaded.parsed;

  const value = env[variableName];
  if (!value) {
    console.error(
      `${variableName} is not set in the repository root .env file.`,
    );
    process.exitCode = 1;
    return;
  }

  let address: ReturnType<typeof walletAddress>;
  try {
    address = walletAddress(value);
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Invalid wallet value.",
    );
    process.exitCode = 1;
    return;
  }

  console.log(`Wallet: ${address}`);
  const results = await Promise.allSettled(
    networks.map(async (network) => ({
      network,
      balances: await balancesFor(network, address, env),
    })),
  );

  let failed = false;
  for (const [index, result] of results.entries()) {
    const network = networks[index];
    if (result.status === "fulfilled") {
      const { native, tokens } = result.value.balances;
      console.log(`${network.name}: ${native.formatted} ${native.symbol}`);
      for (const token of tokens) {
        console.log(`  ${token.symbol}: ${token.formatted}`);
      }
    } else {
      failed = true;
      const message =
        result.reason instanceof Error
          ? result.reason.message
          : "Unknown error.";
      console.error(`${network.name}: ${message}`);
    }
  }

  if (failed) process.exitCode = 1;
}

void main();
