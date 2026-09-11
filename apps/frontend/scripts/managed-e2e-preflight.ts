import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import {
  erc20Abi,
  formatUnits,
  keccak256,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAddress } from "viem/accounts";
import {
  AQUA,
  SWAP_VM,
  classicRouter,
  network,
  token,
  wrapped,
} from "../lib/config";
import { client } from "../lib/server/rpc";

// Read-only CLI. Derive only the public address; never construct a signer.
// Run from apps/frontend and keep RPC errors out of logs because they can contain credentials.
const output = process.argv[2];
assert.ok(output, "Pass a new evidence JSON output path.");
const aquaAbi = parseAbi([
  "function rawBalances(address maker,address app,bytes32 strategyHash,address token) view returns(uint248,uint8)",
]);
type RecordedStrategy = { hash: Hex; pair: string; tokens: Address[] };
type PriorEvidence = {
  account: Address;
  runs: {
    chainId: number;
    mode: string;
    hash: Hex;
    strategies?: RecordedStrategy[];
  }[];
};

async function main() {
  process.loadEnvFile(".env");
  const key = process.env.PRIVATE_KEY?.replace(/^0x/, "");
  assert.ok(key && /^[0-9a-fA-F]{64}$/.test(key));
  const maker = privateKeyToAddress(`0x${key}`);
  const prior = JSON.parse(
    readFileSync("verification/live-execution.json", "utf8"),
  ) as PriorEvidence;
  assert.equal(prior.account.toLowerCase(), maker.toLowerCase());
  const chains = [];
  for (const chainId of [42161, 56, 4663]) {
    const rpc = client(chainId);
    assert.equal(await rpc.getChainId(), chainId);
    const blockNumber = await rpc.getBlockNumber({ cacheTime: 0 });
    const block = await rpc.getBlock({ blockNumber });
    const runs = prior.runs.filter(
      (run) => run.chainId === chainId && run.mode === "liquidity",
    );
    assert.equal(
      runs.length,
      1,
      "Inspect historical evidence before changing scope.",
    );
    const oldStrategies = runs.flatMap((run) => run.strategies ?? []);
    const addresses = [
      ...new Set([
        wrapped(chainId).address,
        ...oldStrategies.flatMap((s) => s.tokens),
      ]),
    ];
    const inventory = [];
    for (const address of addresses) {
      const metadata = token(chainId, address);
      const balance = await rpc.readContract({
        address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [maker],
        blockNumber,
      });
      const allowances = [];
      for (const spender of [AQUA, SWAP_VM, classicRouter(chainId)]) {
        const amount = await rpc.readContract({
          address,
          abi: erc20Abi,
          functionName: "allowance",
          args: [maker, spender],
          blockNumber,
        });
        allowances.push({ spender, amount: String(amount) });
      }
      inventory.push({
        address,
        symbol: metadata.symbol,
        decimals: metadata.decimals,
        rawBalance: String(balance),
        formattedBalance: formatUnits(balance, metadata.decimals),
        allowances,
      });
    }
    const strategies = [];
    for (const strategy of oldStrategies) {
      const allocations = [];
      for (const address of strategy.tokens) {
        const [amount, tokenCount] = await rpc.readContract({
          address: AQUA,
          abi: aquaAbi,
          functionName: "rawBalances",
          args: [maker, SWAP_VM, strategy.hash, address],
          blockNumber,
        });
        allocations.push({
          token: address,
          amount: String(amount),
          tokenCount,
        });
      }
      strategies.push({
        ...strategy,
        app: SWAP_VM,
        allocations,
        ownership: "pre-existing; excluded from this workflow",
      });
    }
    const contracts = [];
    for (const address of [AQUA, SWAP_VM, classicRouter(chainId)]) {
      const code = await rpc.getCode({ address, blockNumber });
      contracts.push({ address, codeHash: code ? keccak256(code) : null });
    }
    const native = await rpc.getBalance({ address: maker, blockNumber });
    const pendingNonce = await rpc.getTransactionCount({
      address: maker,
      blockTag: "pending",
    });
    const minedNonce = await rpc.getTransactionCount({
      address: maker,
      blockNumber,
    });
    chains.push({
      chainId,
      name: network(chainId).name,
      blockNumber: String(blockNumber),
      blockHash: block.hash,
      blockTimestamp: String(block.timestamp),
      nativeBalance: String(native),
      formattedNativeBalance: formatUnits(native, 18),
      minedNonce,
      pendingNonce,
      accountCode: (await rpc.getCode({ address: maker, blockNumber })) ?? "0x",
      contracts,
      inventory,
      strategies,
    });
    console.log(
      JSON.stringify({
        chainId,
        block: String(blockNumber),
        nativeBalance: formatUnits(native, 18),
        oldStrategies: strategies.length,
        pendingNonce,
        minedNonce,
      }),
    );
  }
  const revision = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const dirtyFiles = execFileSync("git", ["status", "--porcelain"], {
    encoding: "utf8",
  })
    .trim()
    .split("\n");
  writeFileSync(
    output,
    JSON.stringify(
      {
        observedAt: new Date().toISOString(),
        revision,
        dirtyFiles,
        maker,
        transactionsSubmitted: 0,
        scope:
          "Historical evidence registrations and their tokens only; not a full wallet asset or event-history census. All listed pre-existing inventory is excluded from new managed capital. Pending nonce is an unpinned liveness check.",
        chains,
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
}

main().catch(() => {
  console.error(
    "Read-only preflight failed; inspect configuration and RPC availability without logging credentials. No transaction was submitted.",
  );
  process.exitCode = 1;
});
