import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { privateKeyToAccount, privateKeyToAddress } from "viem/accounts";
import {
  createWalletClient,
  http,
  keccak256,
  parseEther,
  type Hex,
} from "viem";
import { client } from "../lib/server/rpc";
import { network } from "../lib/config";

const SOURCE = "0xA9aA0Af420578223B11FF5430d428055C52e8C89";
const DESTINATION = "0x992A6a939579e10Ad47C347a5be3788c94992Dd4";
const VALUE = parseEther("0.0015");
const SOURCE_RESERVE = parseEther("0.007");
const FEE_CAP = parseEther("0.00001");
type Attempt = {
  chainId: number;
  nonce: number;
  hash: Hex;
  value: string;
  gas: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  sourceCodeBefore: Hex;
  sourceBalanceBefore: string;
  state: "journaled-before-broadcast" | "receipt-observed" | "confirmed";
  receipt?: {
    status: "success" | "reverted";
    block: string;
    blockHash: Hex;
    gasUsed: string;
    effectiveGasPrice: string;
    explorer: string;
  };
  sourceBalanceAfter?: string;
  destinationBalanceAfter?: string;
  sourceCodeAfter?: Hex;
};

async function main() {
  const [output, flag] = process.argv.slice(2);
  assert.ok(
    output && flag === "--execute-bounded-funding",
    "Explicit bounded funding flag required.",
  );
  process.loadEnvFile(".env");
  const sourceKey = process.env.PRIVATE_KEY?.replace(/^0x/, "");
  assert.ok(sourceKey && /^[0-9a-fA-F]{64}$/.test(sourceKey));
  const source = privateKeyToAccount(`0x${sourceKey}`);
  assert.equal(source.address, SOURCE);
  const targetKey = readFileSync("verification/final-e2e-wallet.env", "utf8")
    .trim()
    .replace(/^PRIVATE_KEY=/, "");
  assert.match(targetKey, /^0x[0-9a-fA-F]{64}$/);
  assert.equal(privateKeyToAddress(targetKey as Hex), DESTINATION);
  const report = {
    gate: "Coordinator msg_21ac15722687: plain native funding only",
    revision: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    createdAt: new Date().toISOString(),
    source: SOURCE,
    destination: DESTINATION,
    attempts: [] as Attempt[],
  };
  // Refuse all reruns of a journal. An ambiguous broadcast must be reconciled by hash.
  writeFileSync(output, JSON.stringify(report, null, 2) + "\n", {
    flag: "wx",
    mode: 0o600,
  });
  const save = () => {
    writeFileSync(`${output}.tmp`, JSON.stringify(report, null, 2) + "\n", {
      mode: 0o600,
    });
    renameSync(`${output}.tmp`, output);
  };
  for (const chainId of [42161, 56, 4663]) {
    const rpc = client(chainId);
    assert.equal(await rpc.getChainId(), chainId);
    const wallet = createWalletClient({
      account: source,
      chain: rpc.chain,
      transport: http(process.env[network(chainId).env]),
    });
    const nonce = await rpc.getTransactionCount({
      address: SOURCE,
      blockTag: "pending",
    });
    assert.equal(
      await rpc.getTransactionCount({ address: SOURCE, blockTag: "latest" }),
      nonce,
      "Pending source transaction requires reconciliation.",
    );
    assert.equal(
      await rpc.getBalance({ address: DESTINATION }),
      0n,
      "Destination already funded; refuse duplicate transfer.",
    );
    const destinationCode = await rpc.getCode({ address: DESTINATION });
    assert.ok(!destinationCode || destinationCode === "0x");
    const sourceCodeBefore = (await rpc.getCode({ address: SOURCE })) ?? "0x";
    const estimatedGas = await rpc.estimateGas({
      account: SOURCE,
      to: DESTINATION,
      value: VALUE,
    });
    const gas = (estimatedGas * 12n + 9n) / 10n;
    const fees = await rpc.estimateFeesPerGas();
    const maximumFee = gas * fees.maxFeePerGas;
    assert.ok(maximumFee <= FEE_CAP, "Funding maximum fee exceeded.");
    const before = await rpc.getBalance({ address: SOURCE });
    assert.ok(before >= VALUE + maximumFee + SOURCE_RESERVE);
    const raw = await wallet.signTransaction({
      account: source,
      chain: rpc.chain,
      type: "eip1559",
      to: DESTINATION,
      value: VALUE,
      data: "0x",
      nonce,
      gas,
      maxFeePerGas: fees.maxFeePerGas,
      maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
    });
    // No authorizationList, account self-call, contract calldata or token approval is permitted.
    assert.equal(await rpc.getChainId(), chainId);
    assert.equal(
      await rpc.getTransactionCount({ address: SOURCE, blockTag: "pending" }),
      nonce,
    );
    assert.ok(
      (await rpc.getBalance({ address: SOURCE })) >=
        VALUE + maximumFee + SOURCE_RESERVE,
    );
    const hash = keccak256(raw);
    const attempt: Attempt = {
      chainId,
      nonce,
      hash,
      value: String(VALUE),
      gas: String(gas),
      maxFeePerGas: String(fees.maxFeePerGas),
      maxPriorityFeePerGas: String(fees.maxPriorityFeePerGas),
      sourceCodeBefore,
      sourceBalanceBefore: String(before),
      state: "journaled-before-broadcast",
    };
    report.attempts.push(attempt);
    save();
    assert.equal(
      await rpc.sendRawTransaction({ serializedTransaction: raw }),
      hash,
    );
    const receipt = await rpc.waitForTransactionReceipt({
      hash,
      timeout: 120_000,
    });
    attempt.state = "receipt-observed";
    attempt.receipt = {
      status: receipt.status,
      block: String(receipt.blockNumber),
      blockHash: receipt.blockHash,
      gasUsed: String(receipt.gasUsed),
      effectiveGasPrice: String(receipt.effectiveGasPrice),
      explorer: `${network(chainId).explorer}/tx/${hash}`,
    };
    // Preserve mined evidence even when a later read fails or a postcondition refuses.
    save();
    assert.equal(receipt.status, "success");
    const blockNumber = receipt.blockNumber;
    const after = await rpc.getBalance({ address: SOURCE, blockNumber });
    const destinationAfter = await rpc.getBalance({
      address: DESTINATION,
      blockNumber,
    });
    const sourceCodeAfter =
      (await rpc.getCode({ address: SOURCE, blockNumber })) ?? "0x";
    Object.assign(attempt, {
      sourceBalanceAfter: String(after),
      destinationBalanceAfter: String(destinationAfter),
      sourceCodeAfter,
    });
    save();
    assert.equal(
      (await rpc.getBlock({ blockNumber })).hash,
      receipt.blockHash,
      "Receipt block changed during readback.",
    );
    assert.equal(
      sourceCodeAfter,
      sourceCodeBefore,
      "Original account delegation changed.",
    );
    assert.equal(destinationAfter, VALUE);
    assert.ok(after >= SOURCE_RESERVE);
    attempt.state = "confirmed";
    save();
    console.log(
      JSON.stringify({
        chainId,
        hash,
        status: "confirmed",
        sourceBalance: String(after),
        destinationBalance: String(destinationAfter),
      }),
    );
  }
}
main().catch(() => {
  console.error(
    "Bounded funding stopped. Inspect the durable public transaction journal before any retry; a broadcast may already exist. Credential and raw transaction details withheld.",
  );
  process.exitCode = 1;
});
