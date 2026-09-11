import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { privateKeyToAddress } from "viem/accounts";
import { parseEther, type Hex } from "viem";
import { client } from "../lib/server/rpc";

// This preflight cannot sign or submit. Funding requires a separately accepted execution step.
async function main() {
  const output = process.argv[2];
  assert.ok(output, "Pass a new funding-preflight JSON output path.");
  process.loadEnvFile(".env");
  const sourceKey = process.env.PRIVATE_KEY?.replace(/^0x/, "");
  assert.ok(sourceKey && /^[0-9a-fA-F]{64}$/.test(sourceKey));
  const source = privateKeyToAddress(`0x${sourceKey}`);
  const targetKey = readFileSync("verification/final-e2e-wallet.env", "utf8")
    .trim()
    .replace(/^PRIVATE_KEY=/, "");
  assert.match(targetKey, /^0x[0-9a-fA-F]{64}$/);
  const destination = privateKeyToAddress(targetKey as Hex);
  assert.notEqual(source, destination);
  const transfers = [];
  for (const chainId of [42161, 56, 4663]) {
    const rpc = client(chainId);
    assert.equal(await rpc.getChainId(), chainId);
    const blockNumber = await rpc.getBlockNumber({ cacheTime: 0 });
    const block = await rpc.getBlock({ blockNumber });
    const sourceBalance = await rpc.getBalance({
      address: source,
      blockNumber,
    });
    const destinationBalance = await rpc.getBalance({
      address: destination,
      blockNumber,
    });
    const destinationCode = await rpc.getCode({
      address: destination,
      blockNumber,
    });
    assert.equal(destinationBalance, 0n);
    assert.ok(!destinationCode || destinationCode === "0x");
    const value = parseEther("0.0015");
    const estimatedGas = await rpc.estimateGas({
      account: source,
      to: destination,
      value,
    });
    const fees = await rpc.estimateFeesPerGas();
    const gasLimit = (estimatedGas * 12n) / 10n;
    const feeCeiling = gasLimit * fees.maxFeePerGas;
    assert.ok(
      feeCeiling <= parseEther("0.00001"),
      "Funding fee ceiling exceeded.",
    );
    assert.ok(
      sourceBalance - value - feeCeiling >= parseEther("0.007"),
      "Original wallet recovery reserve would be breached.",
    );
    transfers.push({
      chainId,
      blockNumber: String(blockNumber),
      blockHash: block.hash,
      sourceBalance: String(sourceBalance),
      destinationBalance: String(destinationBalance),
      value: String(value),
      estimatedGas: String(estimatedGas),
      gasLimit: String(gasLimit),
      maxFeePerGas: String(fees.maxFeePerGas),
      maxPriorityFeePerGas: String(fees.maxPriorityFeePerGas),
      maximumFee: String(feeCeiling),
      originalWalletMinimumReserve: String(parseEther("0.007")),
      managedFundingBudget: String(
        parseEther(chainId === 56 ? "0.0005" : "0.0002"),
      ),
      managedGasReserve: String(parseEther("0.0005")),
    });
  }
  const report = {
    observedAt: new Date().toISOString(),
    source,
    destination,
    transactionsSubmitted: 0,
    transfers,
  };
  writeFileSync(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify(report));
}
main().catch(() => {
  console.error(
    "Funding preflight failed without signing or submission; provider and credential details withheld.",
  );
  process.exitCode = 1;
});
