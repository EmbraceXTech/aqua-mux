import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import solc from "solc";
import { Address as SdkAddress, HexString } from "@1inch/sdk-core";
import { Order, SwapVMContract, TakerTraits } from "@1inch/swap-vm-sdk";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseAbi,
  encodeFunctionData,
  decodeFunctionData,
  decodeAbiParameters,
  erc20Abi,
  parseEther,
  toHex,
  parseEventLogs,
  type Address,
  type Hex,
  type Abi,
} from "viem";
import { AQUA, SWAP_VM, KYC, NATIVE, tokens, wrapped } from "../lib/config";
import { buildPlan } from "../lib/server/plan";
import type { Call } from "../lib/model";
import { verifyManagedLifecycle } from "./verify-managed-lifecycle";
process.loadEnvFile(".env");
const fork = process.env.ARBITRUM_RPC_URL;
assert.ok(fork, "ARBITRUM_RPC_URL is required");
const port = Number(process.env.AQUAMUX_TEST_PORT ?? 18547);
const url = `http://127.0.0.1:${port}`;
try {
  await fetch(url, {
    method: "POST",
    body: "{}",
    signal: AbortSignal.timeout(300),
  });
  throw new Error(
    "Test port is occupied. Set AQUAMUX_TEST_PORT to an unused port.",
  );
} catch (e) {
  if (e instanceof Error && e.message.includes("occupied")) throw e;
}
const require = createRequire(import.meta.url);
const arch = process.arch === "arm64" ? "arm64" : "amd64";
const executable = require.resolve(
  `@foundry-rs/anvil-${process.platform}-${arch}/bin/anvil`,
);
const anvil = spawn(
  executable,
  [
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--chain-id",
    "42161",
    "--hardfork",
    "prague",
    "--fork-url",
    fork,
    "--silent",
  ],
  { stdio: "ignore" },
);
process.env.ARBITRUM_RPC_URL = url;
const chain = defineChain({
  id: 42161,
  name: "AquaMux local fork",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [url] } },
});
const client = createPublicClient({
  chain,
  transport: http(url, { retryCount: 0, timeout: 15000 }),
});
const admin = createWalletClient({ chain, transport: http(url) });
const checks: string[] = [],
  hashes: string[] = [];
async function rpc(method: string, params: unknown[]) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j.result;
}
try {
  let ready = false;
  for (let i = 0; i < 120; i++) {
    try {
      await client.getChainId();
      ready = true;
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  assert.ok(ready, "Local fork did not start");
  const block = await client.getBlockNumber();
  const [owner] = await admin.getAddresses();
  assert.ok(owner);
  const code = await client.getCode({ address: AQUA });
  assert.ok(code && code !== "0x");
  assert.ok(await client.getCode({ address: SWAP_VM }));
  const output = JSON.parse(
    solc.compile(
      JSON.stringify({
        language: "Solidity",
        sources: {
          "TestWallet.sol": {
            content: readFileSync(
              new URL("../../contracts/TestWallet.sol", import.meta.url),
              "utf8",
            ),
          },
        },
        settings: {
          optimizer: { enabled: true, runs: 200 },
          evmVersion: "prague",
          outputSelection: {
            "*": {
              "*": [
                "abi",
                "evm.bytecode.object",
                "evm.deployedBytecode.object",
              ],
            },
          },
        },
      }),
    ),
  );
  assert.equal(
    (output.errors ?? []).filter(
      (e: { severity: string }) => e.severity === "error",
    ).length,
    0,
  );
  const contracts = output.contracts["TestWallet.sol"];
  async function receipt(hash: Hex) {
    const r = await client.waitForTransactionReceipt({
      hash,
      pollingInterval: 20,
    });
    hashes.push(hash);
    return r;
  }
  async function deploy(name: string) {
    const c = contracts[name];
    const r = await receipt(
      await admin.deployContract({
        account: owner,
        abi: c.abi,
        bytecode: `0x${c.evm.bytecode.object}`,
      }),
    );
    assert.equal(r.status, "success");
    return r.contractAddress!;
  }
  const wallet = await deploy("TestWallet"),
    taker = await deploy("TestWallet");
  for (const address of [wallet, taker])
    await rpc("anvil_setBalance", [address, toHex(parseEther("10"))]);
  const paired = ["USDC", "WBTC"].map(
    (s) => tokens(42161).find((t) => t.symbol === s)!,
  );
  for (const t of paired) {
    await rpc("anvil_setCode", [
      t.address,
      `0x${contracts.TestToken.evm.deployedBytecode.object}`,
    ]);
    const amount = t.symbol === "USDC" ? 2000000000n : 2500000n;
    const r = await receipt(
      await admin.writeContract({
        account: owner,
        address: t.address,
        abi: parseAbi(["function mint(address,uint256)"]),
        functionName: "mint",
        args: [wallet, amount],
      }),
    );
    assert.equal(r.status, "success");
  }
  const input = {
    chainId: 42161,
    mode: "liquidity",
    source: NATIVE,
    amount: "1",
    slippageBps: 50,
    feeBps: 5,
    range: { minPct: -20, maxPct: 20 },
    legs: paired.map((t, i) => ({
      address: t.address,
      bps: 5000,
      amount: i === 0 ? "2000" : "0.025",
    })),
  };
  const plan = await buildPlan(input, wallet);
  const walletAbi = contracts.TestWallet.abi as Abi;
  async function execute(address: Address, calls: Call[]) {
    return receipt(
      await admin.writeContract({
        account: owner,
        address,
        abi: walletAbi,
        functionName: "execute",
        args: [
          calls.map((c) => ({
            to: c.to,
            data: c.data,
            value: BigInt(c.value),
          })),
        ],
        gas: 10000000n,
      }),
    );
  }
  const registered = await execute(wallet, plan.calls);
  assert.equal(registered.status, "success");
  const aquaAbi = parseAbi([
    "event Shipped(address maker,address app,bytes32 strategyHash,bytes strategy)",
    "function rawBalances(address maker,address app,bytes32 strategyHash,address token) view returns(uint248,uint8)",
    "function ship(address app,bytes strategy,address[] tokens,uint256[] amounts) returns(bytes32)",
  ]);
  const events = parseEventLogs({
    abi: aquaAbi,
    logs: registered.logs,
    eventName: "Shipped",
  });
  assert.equal(events.length, 2);
  assert.ok(
    events.every((e) => e.args.maker.toLowerCase() === wallet.toLowerCase()),
  );
  const weth = wrapped(42161).address;
  const balance = (token: Address, who: Address) =>
    client.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [who],
    });
  assert.equal(await balance(weth, wallet), parseEther("1"));
  for (const s of plan.strategies) {
    const [amount] = await client.readContract({
      address: AQUA,
      abi: aquaAbi,
      functionName: "rawBalances",
      args: [wallet, SWAP_VM, s.hash, weth],
    });
    assert.equal(amount, parseEther("1"));
  }
  assert.equal(await balance(paired[0].address, wallet), 2000000000n);
  assert.equal(await balance(paired[1].address, wallet), 2500000n);
  checks.push(
    "One atomic transaction wraps native ETH, approves exact amounts, and ships two canonical Aqua strategies.",
    "The maker is the user-controlled test wallet. One real WETH balance backs both pairs; paired assets stay in that wallet.",
  );
  const fresh = await buildPlan(input, wallet);
  const duplicate = plan.calls.find((c) => c.label.startsWith("Create"))!;
  const before = await balance(weth, wallet);
  const reverted = await execute(wallet, [...fresh.calls, duplicate]);
  assert.equal(reverted.status, "reverted");
  assert.equal(await balance(weth, wallet), before);
  for (const s of fresh.strategies) {
    const [amount] = await client.readContract({
      address: AQUA,
      abi: aquaAbi,
      functionName: "rawBalances",
      args: [wallet, SWAP_VM, s.hash, weth],
    });
    assert.equal(amount, 0n);
  }
  checks.push(
    "A failure in the last LP call reverts prior wrapping, approvals and all new strategy registrations.",
  );
  const shipCalls = plan.calls.filter((c) => c.label.startsWith("Create"));
  const orders = shipCalls.map((c) =>
    Order.decode(
      new HexString(
        decodeFunctionData({ abi: aquaAbi, data: c.data }).args[1] as Hex,
      ),
    ),
  );
  const deadline = (await client.getBlock()).timestamp + 600n;
  const args = orders.map((order, i) => ({
    order,
    tokenIn: new SdkAddress(weth),
    tokenOut: new SdkAddress(paired[i].address),
    amount: parseEther("0.01"),
    takerTraits: TakerTraits.default().with({ deadline, threshold: 1n }),
  }));
  await assert.rejects(
    client.call({
      account: owner,
      to: SWAP_VM,
      data: SwapVMContract.encodeQuoteCallData(args[0]).toString() as Hex,
    }),
  );
  checks.push(
    "The real SwapVM resolver credential gate rejects the uncredentialed local origin.",
  );
  // Resolver credential is a local fixture, never changed on the live network.
  await rpc("anvil_setCode", [
    KYC,
    `0x${contracts.TestCredential.evm.deployedBytecode.object}`,
  ]);
  const swapCalls: Call[] = [];
  for (const a of args) {
    const q = await client.call({
      account: owner,
      to: SWAP_VM,
      data: SwapVMContract.encodeQuoteCallData(a).toString() as Hex,
    });
    const [, out] = decodeAbiParameters(
      [{ type: "uint256" }, { type: "uint256" }, { type: "bytes32" }],
      q.data!,
    );
    assert.ok(out > 0n);
    a.takerTraits = a.takerTraits.with({ threshold: (out * 9950n) / 10000n });
    swapCalls.push({
      to: SWAP_VM,
      data: SwapVMContract.encodeSwapCallData(a).toString() as Hex,
      value: "0x0",
      label: "SwapVM fill",
    });
  }
  const fund: Call = {
    to: weth,
    data: encodeFunctionData({
      abi: parseAbi(["function deposit() payable"]),
      functionName: "deposit",
    }),
    value: toHex(parseEther("0.02")),
    label: "Wrap",
  };
  const approve: Call = {
    to: weth,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [SWAP_VM, parseEther("0.02")],
    }),
    value: "0x0",
    label: "Approve",
  };
  const filled = await execute(taker, [fund, approve, ...swapCalls]);
  assert.equal(filled.status, "success");
  assert.equal(await balance(weth, taker), 0n);
  for (const t of paired) assert.ok((await balance(t.address, taker)) > 0n);
  checks.push(
    "A credential-fixtured taker atomically swaps one WETH input into two tokens through the canonical SwapVM router.",
  );
  const beforeOut = await balance(paired[0].address, taker);
  args[1].takerTraits = args[1].takerTraits.with({ threshold: 2n ** 128n });
  const impossible = {
    ...swapCalls[1],
    data: SwapVMContract.encodeSwapCallData(args[1]).toString() as Hex,
  };
  const failedSwap = await execute(taker, [
    fund,
    approve,
    swapCalls[0],
    impossible,
  ]);
  assert.equal(failedSwap.status, "reverted");
  assert.equal(await balance(paired[0].address, taker), beforeOut);
  assert.equal(await balance(weth, taker), 0n);
  checks.push(
    "A failing output minimum on the final swap rolls back the first fill and native wrapping.",
  );
  const managed = await verifyManagedLifecycle({
    client,
    owner,
    walletAbi,
    deployWallet: () => deploy("TestWallet"),
    execute,
    rpc,
  });
  checks.push(...managed.checks);
  mkdirSync("verification", { recursive: true });
  writeFileSync(
    "verification/fork.json",
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        forkChainId: 42161,
        forkBlock: block.toString(),
        aqua: AQUA,
        swapVm: SWAP_VM,
        fixtures:
          "Local TestWallet contracts; paired token code and resolver credential replaced only on isolated Anvil fork. WETH, Aqua and SwapVM use forked deployments. No live transactions.",
        checks,
        transactionHashes: hashes,
        managedLifecycle: managed,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(checks.map((c) => "PASS " + c).join("\n"));
} catch (e) {
  console.error(
    e instanceof Error
      ? e.message.replace(/https?:\/\/[^\s"']+/g, "[redacted endpoint]")
      : "Fork verification failed",
  );
  process.exitCode = 1;
} finally {
  anvil.kill("SIGTERM");
}
