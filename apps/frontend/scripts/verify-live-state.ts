import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { formatUnits, parseAbi, erc20Abi, type Address, type Hex } from "viem";
import { client } from "../lib/server/rpc";
import { network, wrapped, tokens, AQUA, SWAP_VM } from "../lib/config";
process.loadEnvFile(".env");
const report = JSON.parse(
  readFileSync("verification/live-execution.json", "utf8"),
);
const address = report.account as Address;
const aquaAbi = parseAbi([
  "function rawBalances(address maker,address app,bytes32 strategyHash,address token) view returns(uint248,uint8)",
]);
const results = [];
for (const chainId of [42161, 56, 4663]) {
  const c = client(chainId),
    n = network(chainId),
    runs = report.runs.filter(
      (r: { chainId: number }) => r.chainId === chainId,
    );
  const code = await c.getCode({ address });
  assert.ok(!code || code === "0x", "Temporary delegation remains");
  const receipts = [];
  let gasCost = 0n;
  for (const r of runs) {
    const receipt = await c.getTransactionReceipt({ hash: r.hash });
    assert.equal(receipt.status, "success");
    gasCost += receipt.gasUsed * receipt.effectiveGasPrice;
    receipts.push({
      mode: r.mode,
      hash: r.hash,
      status: receipt.status,
      block: receipt.blockNumber.toString(),
      explorer: `${n.explorer}/tx/${r.hash}`,
    });
  }
  const lp = runs.find((r: { mode: string }) => r.mode === "liquidity");
  assert.ok(lp);
  assert.equal(lp.strategies.length, 2);
  const strategies = [];
  for (const s of lp.strategies) {
    const allocations = [];
    for (const token of s.tokens as Address[]) {
      const [value, count] = await c.readContract({
        address: AQUA,
        abi: aquaAbi,
        functionName: "rawBalances",
        args: [address, SWAP_VM, s.hash as Hex, token],
      });
      assert.equal(count, 2);
      assert.ok(value > 0n);
      allocations.push({ token, rawAmount: value.toString() });
    }
    strategies.push({ hash: s.hash, pair: s.pair, active: true, allocations });
  }
  const addresses = [
    ...new Set<Address>([
      wrapped(chainId).address,
      ...lp.strategies.flatMap((s: { tokens: Address[] }) => s.tokens),
    ]),
  ];
  const inventory = [];
  for (const token of addresses) {
    const t = tokens(chainId).find((t) => t.address === token)!;
    const balance = await c.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address],
    });
    inventory.push({
      symbol: t.symbol,
      address: token,
      amount: formatUnits(balance, t.decimals),
    });
  }
  const result = {
    chainId,
    name: n.name,
    nativeSymbol: n.symbol,
    nativeBalance: formatUnits(await c.getBalance({ address }), 18),
    gasSpent: formatUnits(gasCost, 18),
    delegationCleared: true,
    strategies,
    inventory,
    receipts,
  };
  results.push(result);
  console.log(
    JSON.stringify({
      chainId,
      nativeBalance: result.nativeBalance,
      gasSpent: result.gasSpent,
      activePairs: strategies.length,
      delegationCleared: true,
    }),
  );
}
writeFileSync(
  "verification/live-state.json",
  JSON.stringify(
    {
      verifiedAt: new Date().toISOString(),
      account: address,
      networks: results,
    },
    null,
    2,
  ) + "\n",
);
