#!/usr/bin/env npx tsx

import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { privateKeyToAccount } from "viem/accounts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, ".env");

function usage() {
  console.error(
    "Usage: npx tsx scripts/get-wallet-address.ts <PRIVATE_KEY_ENV_VARIABLE>",
  );
}

function accountFromPrivateKey(value: string) {
  const privateKey = value.replace(/^0x/, "");
  if (!/^[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error("The named value must be an Ethereum private key.");
  }

  try {
    return privateKeyToAccount(`0x${privateKey}`);
  } catch {
    throw new Error("The named value is not a valid Ethereum private key.");
  }
}

function main() {
  const variableName = process.argv[2];
  if (!variableName || process.argv.length !== 3) {
    usage();
    process.exitCode = 1;
    return;
  }

  const result = config({ path: envPath, processEnv: {}, quiet: true });
  if (result.error || !result.parsed) {
    console.error("Could not read the repository root .env file.");
    process.exitCode = 1;
    return;
  }

  const privateKey = result.parsed[variableName];
  if (!privateKey) {
    console.error(`${variableName} is not set in the repository root .env file.`);
    process.exitCode = 1;
    return;
  }

  try {
    console.log(accountFromPrivateKey(privateKey).address);
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Invalid Ethereum private key.",
    );
    process.exitCode = 1;
  }
}

main();
