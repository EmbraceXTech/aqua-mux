#!/usr/bin/env npx tsx

import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  erc20Abi,
  formatUnits,
  http,
  isAddress,
  parseUnits,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { networks } from "../lib/constants/networks.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, ".env");

function usage() {
  console.error(
    "Usage: npx tsx scripts/transfer.ts <ENV_VARIABLE_NAME> <chain> <recipient> <asset> <amount> --execute",
  );
  console.error("<chain> is Ethereum, Arbitrum, Robinhood Chain, or BNB Chain.");
  console.error("<asset> is native or an ERC-20 contract address.");
}

function accountFrom(value: string) {
  const privateKey = value.replace(/^0x/, "");
  if (!/^[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error("The named value must be an Ethereum private key.");
  }
  return privateKeyToAccount(`0x${privateKey}`);
}

async function main() {
  const [variableName, chainName, recipientValue, asset, amount, execute] =
    process.argv.slice(2);
  if (
    !variableName ||
    !chainName ||
    !recipientValue ||
    !asset ||
    !amount ||
    execute !== "--execute" ||
    process.argv.length !== 8
  ) {
    usage();
    process.exitCode = 1;
    return;
  }
  if (!isAddress(recipientValue)) throw new Error("Recipient is not an address.");
  if (amount !== "max" && !/^\d+(\.\d+)?$/.test(amount)) {
    throw new Error("Amount must be a positive decimal number or max.");
  }

  const envResult = config({ path: envPath, processEnv: {}, quiet: true });
  if (envResult.error || !envResult.parsed) {
    throw new Error("Could not read the repository root .env file.");
  }
  const env = envResult.parsed;
  const privateKey = env[variableName];
  if (!privateKey) throw new Error(`${variableName} is not set in .env.`);

  const network = networks.find(
    (item) => item.name.toLowerCase() === chainName.toLowerCase(),
  );
  if (!network) throw new Error(`Unsupported chain: ${chainName}.`);
  const rpcUrl = env[network.rpcEnv];
  if (!rpcUrl) throw new Error(`${network.rpcEnv} is not set in .env.`);

  const account = accountFrom(privateKey);
  const recipient = recipientValue as Address;
  const publicClient = createPublicClient({
    chain: network.chain,
    transport: http(rpcUrl, { timeout: 20_000 }),
  });
  const walletClient = createWalletClient({
    account,
    chain: network.chain,
    transport: http(rpcUrl, { timeout: 20_000 }),
  });

  if ((await publicClient.getChainId()) !== network.chain.id) {
    throw new Error(`${network.rpcEnv} is connected to the wrong network.`);
  }

  if (asset === "native") {
    const gas = await publicClient.estimateGas({
      account: account.address,
      to: recipient,
      value: 1n,
    });
    const gasPrice = (await publicClient.getGasPrice()) * 2n;
    const value =
      amount === "max"
        ? (await publicClient.getBalance({ address: account.address })) - gas * gasPrice
        : parseUnits(amount, network.chain.nativeCurrency.decimals);
    if (value <= 0n) throw new Error("Amount is not enough to pay for gas.");
    const hash = await walletClient.sendTransaction({
      to: recipient,
      value,
      gas,
      gasPrice,
    });
    console.log(`Submitted native transfer: ${hash}`);
    console.log(
      `${formatUnits(value, network.chain.nativeCurrency.decimals)} ${network.chain.nativeCurrency.symbol} to ${recipient}`,
    );
    console.log(`Estimated gas: ${gas}`);
    console.log(`Gas price: ${gasPrice}`);
    return;
  }

  if (!isAddress(asset)) throw new Error("Asset must be native or an ERC-20 address.");
  const token = asset as Address;
  const [decimals, symbol] = await Promise.all([
    publicClient.readContract({ address: token, abi: erc20Abi, functionName: "decimals" }),
    publicClient.readContract({ address: token, abi: erc20Abi, functionName: "symbol" }),
  ]);
  const value = parseUnits(amount, decimals);
  if (value <= 0n) throw new Error("Amount must be greater than zero.");
  await publicClient.simulateContract({
    account: account.address,
    address: token,
    abi: erc20Abi,
    functionName: "transfer",
    args: [recipient, value],
  });
  const hash = await walletClient.writeContract({
    address: token,
    abi: erc20Abi,
    functionName: "transfer",
    args: [recipient, value],
  });
  console.log(`Submitted ERC-20 transfer: ${hash}`);
  console.log(`${formatUnits(value, decimals)} ${symbol} to ${recipient}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Transfer failed.");
  process.exitCode = 1;
});
