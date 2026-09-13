// Executes only against an isolated loopback Anvil fork. Never uses a wallet key.
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import {
  createPublicClient,
  createWalletClient,
  erc20Abi,
  http,
  parseUnits,
  type Address,
} from "viem";
import { arbitrum } from "viem/chains";
import {
  buildSwap,
  finishQuote,
  getToken,
  initialDrafts,
  poolAddress,
  quoterAbi,
  routeLegs,
  SWAP_CHAIN,
  V3_QUOTER,
  V3_ROUTER,
  type SwapRequest,
} from "../lib/live-swap";

process.loadEnvFile(".env");
const upstream = process.env.ARBITRUM_RPC_URL;
if (!upstream)
  throw Error("ARBITRUM_RPC_URL is required for read-only fork state.");
const port = 18549;
const url = `http://127.0.0.1:${port}`;
// Never attach to a pre-existing service that might not be our isolated fork.
try {
  await fetch(url, { method: "POST", signal: AbortSignal.timeout(500) });
  throw Error("Fork port already occupied.");
} catch (e) {
  if (e instanceof Error && e.message === "Fork port already occupied.")
    throw e;
}
const node = spawn(
  process.execPath,
  [
    "node_modules/@foundry-rs/anvil/bin.mjs",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--chain-id",
    String(SWAP_CHAIN),
    "--fork-url",
    upstream,
    "--no-storage-caching",
    "--silent",
  ],
  { stdio: "ignore" },
);
const c = createPublicClient({
  chain: arbitrum,
  transport: http(url, { timeout: 30000 }),
});
const w = createWalletClient({
  chain: arbitrum,
  transport: http(url, { timeout: 30000 }),
});
const account = "0x000000000000000000000000000000000000bEEF" as Address;
async function rpc(method: string, params: unknown[] = []) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const data = await r.json();
  if (data.error) throw Error(data.error.message);
  return data.result;
}
async function quote(request: SwapRequest) {
  const routed = routeLegs(request);
  const block = await c.getBlockNumber({ cacheTime: 0 });
  const results = await Promise.all(
    routed.legs.map(
      async (l) =>
        (
          await c.simulateContract({
            address: V3_QUOTER,
            abi: quoterAbi,
            functionName:
              request.draft.exact === "input"
                ? "quoteExactInputSingle"
                : "quoteExactOutputSingle",
            args: [
              poolAddress(l.input),
              poolAddress(l.output),
              l.fee,
              BigInt(l.amount),
              0n,
            ],
            blockNumber: block,
          })
        ).result,
    ),
  );
  return finishQuote(routed.request, routed.legs, results, block);
}
async function approve(symbol: "USDC" | "WBTC", amount: bigint) {
  const hash = await w.writeContract({
    account,
    address: getToken(symbol).address,
    abi: erc20Abi,
    functionName: "approve",
    args: [V3_ROUTER, amount],
  });
  assert.equal((await c.waitForTransactionReceipt({ hash })).status, "success");
}
async function balances() {
  return {
    ETH: await c.getBalance({ address: account }),
    USDC: await c.readContract({
      address: getToken("USDC").address,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [account],
    }),
    WBTC: await c.readContract({
      address: getToken("WBTC").address,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [account],
    }),
  };
}
try {
  let ready = false;
  for (let i = 0; i < 120; i++) {
    if (node.exitCode !== null)
      throw Error("Anvil exited before becoming ready.");
    try {
      assert.match(await rpc("web3_clientVersion"), /anvil/i);
      ready = true;
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  assert.ok(ready, "Anvil fork did not start");
  await rpc("anvil_impersonateAccount", [account]);
  await rpc("anvil_setBalance", [account, "0x8ac7230489e80000"]);
  const make = (
    mode: SwapRequest["mode"],
    exact: "input" | "output",
    seed = false,
  ): SwapRequest => {
    const draft = initialDrafts()[mode];
    draft.exact = exact;
    for (const r of [...draft.input, ...draft.output])
      r.amount =
        r.symbol === "ETH"
          ? seed
            ? "0.1"
            : "0.0001"
          : r.symbol === "USDC"
            ? "0.1"
            : "0.000001";
    return { chainId: SWAP_CHAIN, mode, draft, slippageBps: 50 };
  };
  // Fund only the synthetic fork account through the same router under test.
  const seed = await quote(make("multi-out", "input", true));
  const seedHash = await w.sendTransaction({
    account,
    ...buildSwap(seed, account),
  });
  assert.equal(
    (await c.waitForTransactionReceipt({ hash: seedHash })).status,
    "success",
  );
  for (const mode of ["multi-in", "multi-out"] as const)
    for (const exact of ["input", "output"] as const) {
      let q = await quote(make(mode, exact));
      if (mode === "multi-in") {
        for (const [i, r] of q.request.draft.input.entries())
          await approve(
            r.symbol as "USDC" | "WBTC",
            parseUnits(q.limits.input[i], getToken(r.symbol).decimals),
          );
        q = await quote(make(mode, exact));
        // Approve refreshed bounded caps on the isolated node only.
        for (const [i, r] of q.request.draft.input.entries())
          await approve(
            r.symbol as "USDC" | "WBTC",
            parseUnits(q.limits.input[i], getToken(r.symbol).decimals),
          );
      }
      const before = await balances();
      const tx = buildSwap(q, account);
      await c.call({ account, ...tx });
      await c.estimateGas({ account, ...tx });
      const hash = await w.sendTransaction({ account, ...tx });
      const receipt = await c.waitForTransactionReceipt({ hash });
      assert.equal(receipt.status, "success");
      const after = await balances();
      const gas = receipt.gasUsed * receipt.effectiveGasPrice;
      for (const [i, r] of q.request.draft.input.entries()) {
        const symbol = r.symbol as keyof typeof before;
        const spent =
          before[symbol] - after[symbol] - (symbol === "ETH" ? gas : 0n);
        assert.ok(
          spent > 0n &&
            spent <= parseUnits(q.limits.input[i], getToken(symbol).decimals),
        );
        if (exact === "input")
          assert.equal(
            spent,
            parseUnits(q.amounts.input[i], getToken(symbol).decimals),
          );
      }
      for (const [i, r] of q.request.draft.output.entries()) {
        const symbol = r.symbol as keyof typeof before;
        const received =
          after[symbol] - before[symbol] + (symbol === "ETH" ? gas : 0n);
        assert.ok(
          received >= parseUnits(q.limits.output[i], getToken(symbol).decimals),
        );
        if (exact === "output")
          assert.equal(
            received,
            parseUnits(q.amounts.output[i], getToken(symbol).decimals),
          );
      }
      console.log(
        `PASS ${mode}, exact ${exact}: mined, balance changes and slippage limits verified`,
      );
    }
  const rollback = await quote(make("multi-out", "input"));
  rollback.legs[1].minOut = String(2n ** 120n);
  const beforeRevert = await balances();
  const revertTx = buildSwap(rollback, account);
  await assert.rejects(c.call({ account, ...revertTx }));
  const revertHash = await w.sendTransaction({
    account,
    ...revertTx,
    gas: 3000000n,
  });
  const reverted = await c.waitForTransactionReceipt({ hash: revertHash });
  assert.equal(reverted.status, "reverted");
  const afterRevert = await balances();
  assert.equal(beforeRevert.USDC, afterRevert.USDC);
  assert.equal(beforeRevert.WBTC, afterRevert.WBTC);
  assert.equal(
    beforeRevert.ETH - afterRevert.ETH,
    reverted.gasUsed * reverted.effectiveGasPrice,
  );
  console.log(
    "PASS failing second leg: whole basket reverted; only simulated gas spent",
  );
  const snapshot = await rpc("evm_snapshot");
  const q = await quote(make("multi-out", "input"));
  const tx = buildSwap(q, account);
  await rpc("evm_increaseTime", [180]);
  await rpc("evm_mine");
  const delayed = await w.sendTransaction({ account, ...tx });
  assert.equal(
    (await c.waitForTransactionReceipt({ hash: delayed })).status,
    "success",
  );
  console.log(
    "PASS three-minute wallet delay: swap mined with the new ten-minute deadline",
  );
  await rpc("evm_revert", [snapshot]);
  await rpc("evm_increaseTime", [601]);
  await rpc("evm_mine");
  await assert.rejects(c.call({ account, ...tx }), /Transaction too old/);
  console.log("PASS expired deadline: router rejects the stale request");
  console.log(
    "All funded execution was local simulation. No mainnet transactions submitted.",
  );
} finally {
  node.kill("SIGTERM");
}
