import assert from "node:assert/strict";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { chromium, expect } from "@playwright/test";
import { privateKeyToAccount } from "viem/accounts";
import {
  createWalletClient,
  http,
  encodeFunctionData,
  parseAbi,
  formatUnits,
  parseEther,
  keccak256,
  toHex,
  zeroAddress,
  erc20Abi,
  parseEventLogs,
  type Address,
  type Hex,
} from "viem";
import { network, tokens, wrapped, AQUA, SWAP_VM } from "../lib/config";
import { client } from "../lib/server/rpc";
import type { Plan } from "../lib/model";

// An explicit CLI test runner. Never import this file into the app or expose PRIVATE_KEY to a page.
process.loadEnvFile(".env");
assert.ok(
  process.argv.includes("--execute"),
  "Pass --execute to authorize the bounded live test runner.",
);
const key = process.env.PRIVATE_KEY!;
assert.ok(key, "PRIVATE_KEY is required");
const owner = privateKeyToAccount(
  (key.startsWith("0x") ? key : `0x${key}`) as Hex,
);
const implementation = "0xe6Cae83BdE06E4c305530e199D7217f42808555B" as Address;
const codeHash =
  "0xcc7b633aef4b2543cb8f37522adf1a401f910f0f6b2430c1eecc11f401ccfcf3";
const batchAbi = parseAbi([
  "function executeBatch((address target,uint256 value,bytes data)[] calls)",
]);
const aquaAbi = parseAbi([
  "event Shipped(address maker,address app,bytes32 strategyHash,bytes strategy)",
  "function rawBalances(address maker,address app,bytes32 strategyHash,address token) view returns(uint248,uint8)",
]);
const file = "verification/live-execution.json";
mkdirSync("verification", { recursive: true });
type Run = {
  chainId: number;
  mode: string;
  hash: Hex;
  status?: string;
  block?: string;
  gasUsed?: string;
  gasCost?: string;
  nativeBefore?: string;
  nativeAfter?: string;
  strategies?: Plan["strategies"];
  outputs?: Record<string, string>;
  checks?: string[];
};
const report: { account: Address; adapter: string; runs: Run[] } = existsSync(
  file,
)
  ? JSON.parse(readFileSync(file, "utf8"))
  : {
      account: owner.address,
      adapter:
        "Isolated Chromium UI, real viem signer, EIP-5792 adapter to the existing Simple7702Account implementation. Not a MetaMask extension test.",
      runs: [],
    };
assert.equal(
  report.account.toLowerCase(),
  owner.address.toLowerCase(),
  "Report belongs to another account",
);
const save = () => writeFileSync(file, JSON.stringify(report, null, 2) + "\n");
const configs = [
  { id: 42161, symbols: ["USDC", "WBTC"], swap: "0.0002", base: "0.0001" },
  { id: 56, symbols: ["USDC", "ETH"], swap: "0.0005", base: "0.00025" },
  { id: 4663, symbols: ["USDG", "PONS"], swap: "0.0002", base: "0.0001" },
].filter(
  (c) =>
    !process.env.LIVE_CHAIN_ID || c.id === Number(process.env.LIVE_CHAIN_ID),
);
const browser = await chromium.launch({ headless: true });
try {
  for (const config of configs) {
    const chainId = config.id,
      n = network(chainId),
      c = client(chainId),
      wallet = createWalletClient({
        account: owner,
        chain: c.chain,
        transport: http(process.env[n.env]),
      });
    assert.equal(await c.getChainId(), chainId);
    assert.equal(
      keccak256((await c.getCode({ address: implementation }))!),
      codeHash,
      "Unexpected account implementation",
    );
    const codeBefore = await c.getCode({ address: owner.address });
    assert.ok(
      !codeBefore ||
        codeBefore === "0x" ||
        codeBefore.toLowerCase() ===
          `0xef0100${implementation.slice(2).toLowerCase()}`,
      "Account already delegates to an unknown implementation",
    );
    const selected = config.symbols.map(
      (symbol) => tokens(chainId).find((t) => t.symbol === symbol)!,
    );
    const balance = (address: Address) =>
      c.readContract({
        address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [owner.address],
      });
    for (const pending of report.runs.filter(
      (r) => r.chainId === chainId && !r.status,
    )) {
      const receipt = await c.waitForTransactionReceipt({
        hash: pending.hash,
        timeout: 60000,
      });
      pending.status = receipt.status;
      save();
      assert.equal(
        receipt.status,
        "success",
        "Previously submitted transaction reverted; inspect report before retrying.",
      );
    }
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
    });
    const page = await context.newPage();
    let expectedPlan: Plan | undefined;
    let operation = "swap";
    await page.exposeBinding(
      "devWalletRequest",
      async (_, { method, params }: { method: string; params?: unknown[] }) => {
        try {
          if (method === "eth_requestAccounts" || method === "eth_accounts")
            return [owner.address];
          if (method === "eth_chainId") return toHex(chainId);
          if (method === "wallet_switchEthereumChain") {
            assert.equal(
              (params![0] as { chainId: string }).chainId,
              toHex(chainId),
            );
            return null;
          }
          if (method === "wallet_getCapabilities")
            return { [toHex(chainId)]: { atomic: { status: "supported" } } };
          if (method === "wallet_getCallsStatus") {
            const hash = params![0] as Hex;
            const r = await c.getTransactionReceipt({ hash }).catch(() => null);
            return r
              ? {
                  status: r.status === "success" ? 200 : 500,
                  atomic: true,
                  receipts: [
                    {
                      transactionHash: r.transactionHash,
                      status: r.status === "success" ? "0x1" : "0x0",
                    },
                  ],
                }
              : { status: 100 };
          }
          if (method !== "wallet_sendCalls")
            throw new Error(`Unsupported test wallet method: ${method}`);
          const request = params![0] as {
            chainId: string;
            from: string;
            atomicRequired: boolean;
            calls: Plan["calls"];
          };
          assert.ok(expectedPlan, "No reviewed server plan");
          assert.equal(request.chainId, toHex(chainId));
          assert.equal(request.from.toLowerCase(), owner.address.toLowerCase());
          assert.equal(request.atomicRequired, true);
          assert.ok(Date.now() < expectedPlan.expiresAt, "Review expired");
          assert.deepEqual(
            request.calls,
            expectedPlan.calls.map(({ to, data, value }) => ({
              to,
              data,
              value,
            })),
            "Wallet calls differ from the reviewed plan",
          );
          assert.ok(
            !report.runs.some(
              (r) => r.chainId === chainId && r.mode === operation,
            ),
            "This operation already has a transaction; never submit it twice",
          );
          const value = request.calls.reduce((s, x) => s + BigInt(x.value), 0n);
          assert.ok(
            value <=
              parseEther(operation === "swap" ? config.swap : config.base),
            "Input exceeds the test budget",
          );
          const code = await c.getCode({ address: owner.address });
          const nonce = await c.getTransactionCount({
            address: owner.address,
            blockTag: "pending",
          });
          const authorizationList =
            !code || code === "0x"
              ? [
                  await wallet.signAuthorization({
                    contractAddress: implementation,
                    executor: "self",
                    nonce: nonce + 1,
                  }),
                ]
              : undefined;
          const data = encodeFunctionData({
            abi: batchAbi,
            functionName: "executeBatch",
            args: [
              request.calls.map((x) => ({
                target: x.to,
                value: BigInt(x.value),
                data: x.data,
              })),
            ],
          });
          const tx = {
            account: owner.address,
            to: owner.address,
            data,
            authorizationList,
            nonce,
          };
          const authGas = await c.estimateGas(tx);
          const stateOverride = [
            {
              address: owner.address,
              code: (await c.getCode({ address: implementation }))!,
            },
          ];
          const overrideGas = await c.estimateGas({
            account: owner.address,
            to: owner.address,
            data,
            stateOverride,
          });
          await c.call({
            account: owner.address,
            to: owner.address,
            data,
            stateOverride,
          });
          const gas =
            authGas > overrideGas + 25000n ? authGas : overrideGas + 25000n;
          const gasPrice = await c.getGasPrice();
          assert.ok(
            gas * gasPrice * 2n < parseEther("0.0003"),
            "Estimated gas exceeds test cap",
          );
          const nativeBefore = await c.getBalance({ address: owner.address });
          assert.ok(
            nativeBefore > value + gas * gasPrice * 2n,
            "Insufficient gas reserve",
          );
          const before = await Promise.all(
            selected.map((t) => balance(t.address)),
          );
          const baseBefore = await balance(wrapped(chainId).address);
          console.log(
            `${n.name} ${operation}: simulation passed, ${request.calls.length} calls, gas ${gas}.`,
          );
          const hash = await wallet.sendTransaction({
            to: owner.address,
            data,
            authorizationList,
            nonce,
            gas: (gas * 130n) / 100n,
            maxFeePerGas: gasPrice * 2n,
            maxPriorityFeePerGas: gasPrice,
          });
          const run: Run = {
            chainId,
            mode: operation,
            hash,
            nativeBefore: formatUnits(nativeBefore, 18),
            strategies: expectedPlan.strategies,
          };
          report.runs.push(run);
          save();
          console.log(`${n.name} ${operation} submitted: ${hash}`);
          const receipt = await c.waitForTransactionReceipt({
            hash,
            timeout: 120000,
            pollingInterval: 800,
          });
          run.status = receipt.status;
          run.block = receipt.blockNumber.toString();
          run.gasUsed = receipt.gasUsed.toString();
          run.gasCost = formatUnits(
            receipt.gasUsed * receipt.effectiveGasPrice,
            18,
          );
          run.nativeAfter = formatUnits(
            await c.getBalance({ address: owner.address }),
            18,
          );
          save();
          assert.equal(receipt.status, "success", "Live transaction reverted");
          const after = await Promise.all(
            selected.map((t) => balance(t.address)),
          );
          run.outputs = Object.fromEntries(
            selected.map((t, i) => [
              t.symbol,
              formatUnits(after[i] - before[i], t.decimals),
            ]),
          );
          if (operation === "swap") {
            assert.ok(
              after.every((v, i) => v > before[i]),
              "An output did not arrive",
            );
            run.checks = [
              "All selected outputs increased in one successful transaction.",
              "Native input and gas stayed within the test cap.",
            ];
          } else {
            assert.equal(
              (await balance(wrapped(chainId).address)) - baseBefore,
              parseEther(config.base),
            );
            assert.deepEqual(
              after,
              before,
              "LP registration moved paired assets",
            );
            const events = parseEventLogs({
              abi: aquaAbi,
              logs: receipt.logs,
              eventName: "Shipped",
            });
            assert.equal(events.length, selected.length);
            assert.ok(
              events.every(
                (e) =>
                  e.args.maker.toLowerCase() === owner.address.toLowerCase(),
              ),
            );
            for (const s of expectedPlan.strategies) {
              const [v] = await c.readContract({
                address: AQUA,
                abi: aquaAbi,
                functionName: "rawBalances",
                args: [
                  owner.address,
                  SWAP_VM,
                  s.hash,
                  wrapped(chainId).address,
                ],
              });
              assert.equal(v, parseEther(config.base));
            }
            run.checks = [
              "All Aqua strategies belong to Dev Wallet.",
              "Each strategy has the full shared base allocation.",
              "The base was wrapped once; paired assets remained in Dev Wallet.",
            ];
          }
          save();
          return { id: hash };
        } catch (error) {
          const e = error as {
            shortMessage?: string;
            details?: string;
            message?: string;
          };
          const safe = (e.shortMessage ?? e.message ?? "Wallet request failed")
            .split("\n")[0]
            .replace(/https?:\/\/[^\s]+/g, "[endpoint]");
          console.error(
            n.name,
            method,
            safe,
            e.details?.split("\n")[0].slice(0, 220) ?? "",
          );
          throw new Error(safe);
        }
      },
    );
    await page.addInitScript(
      `window.ethereum = {isDevWallet:true,selectedAddress:${JSON.stringify(owner.address)},request:function(args){return window.devWalletRequest(args);},on:function(){},removeListener:function(){}};`,
    );
    page.on("response", async (response) => {
      if (response.url().endsWith("/api/plan") && response.status() === 200)
        expectedPlan = await response.json();
    });
    await page.goto("http://127.0.0.1:3100");
    if (chainId !== 42161) {
      await page.locator(".network-button").click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: new RegExp(n.name) })
        .click();
    }
    await page.getByLabel("Input amount").fill(config.swap);
    await page
      .locator(".output-row")
      .last()
      .getByRole("button", { name: /Remove / })
      .click();
    for (let i = 0; i < selected.length; i++) {
      if (
        !(await page.locator(".output-token").nth(i).innerText()).includes(
          selected[i].symbol,
        )
      ) {
        await page.locator(".output-token").nth(i).click();
        await page.getByLabel("Search tokens").fill(selected[i].symbol);
        await page
          .getByRole("dialog")
          .getByRole("button", { name: new RegExp(`^${selected[i].symbol} `) })
          .click();
      }
    }
    await page.locator(".wallet-button").click();
    await page.getByRole("button", { name: "Connect browser wallet" }).click();
    console.log(
      n.name,
      "wallet UI:",
      await page.locator(".error-box").allTextContents(),
    );
    await expect(page.locator(".wallet-button")).toContainText(
      owner.address.slice(0, 6),
    );
    async function perform(mode: string) {
      operation = mode;
      expectedPlan = undefined;
      const response = page.waitForResponse(
        (r) => r.url().endsWith("/api/plan"),
        { timeout: 45000 },
      );
      await page
        .getByRole("button", {
          name:
            mode === "swap"
              ? "Review multi-swap"
              : "Review liquidity positions",
          exact: true,
        })
        .click();
      const r = await response;
      if (!r.ok())
        throw new Error(
          `${n.name} ${mode} plan rejected: ${JSON.stringify(await r.json())}`,
        );
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.getByRole("button", { name: "Confirm in wallet" }).click();
      await Promise.race([
        expect(page.getByRole("dialog")).toContainText(
          "Transaction confirmed",
          { timeout: 150000 },
        ),
        page
          .getByRole("dialog")
          .locator(".error-box")
          .waitFor({ state: "visible", timeout: 150000 })
          .then(async () => {
            throw new Error(
              await page.getByRole("dialog").locator(".error-box").innerText(),
            );
          }),
      ]);
      await page.screenshot({
        path: `verification/live-${chainId}-${mode}.png`,
        fullPage: true,
      });
      await page.getByRole("button", { name: "Close dialog" }).click();
      console.log(
        `${n.name} ${mode}: browser confirmation and receipt checks passed.`,
      );
    }
    if (
      !report.runs.some(
        (r) =>
          r.chainId === chainId && r.mode === "swap" && r.status === "success",
      )
    )
      await perform("swap");
    if (
      !report.runs.some(
        (r) =>
          r.chainId === chainId &&
          r.mode === "liquidity" &&
          r.status === "success",
      )
    ) {
      await page.getByRole("button", { name: "Multi-LP", exact: true }).click();
      await page.getByLabel("Input amount").fill(config.base);
      await page
        .getByRole("button", { name: "Full range", exact: true })
        .click();
      for (const t of selected) {
        const available = await balance(t.address);
        await page
          .getByLabel(`${t.symbol} paired amount`)
          .fill(formatUnits((available * 99n) / 100n, t.decimals));
      }
      await perform("liquidity");
    }
    await context.close();
    // Restore the originally plain EOA after the authorized live tests. LP balances remain registered to the same address.
    if (
      !codeBefore ||
      codeBefore === "0x" ||
      report.runs.some((r) => r.chainId === chainId && r.mode === "swap")
    ) {
      if (await c.getCode({ address: owner.address })) {
        const nonce = await c.getTransactionCount({
          address: owner.address,
          blockTag: "pending",
        });
        const authorization = await wallet.signAuthorization({
          contractAddress: zeroAddress,
          executor: "self",
          nonce: nonce + 1,
        });
        const tx = {
          to: owner.address,
          authorizationList: [authorization],
          nonce,
          value: 0n,
        };
        const gas = await c.estimateGas({ ...tx, account: owner.address });
        const gasPrice = await c.getGasPrice();
        assert.ok(gas * gasPrice * 2n < parseEther("0.0003"));
        const hash = await wallet.sendTransaction({
          ...tx,
          gas: (gas * 130n) / 100n,
          maxFeePerGas: gasPrice * 2n,
          maxPriorityFeePerGas: gasPrice,
        });
        const run: Run = { chainId, mode: "restore-eoa", hash };
        report.runs.push(run);
        save();
        const r = await c.waitForTransactionReceipt({ hash, timeout: 120000 });
        run.status = r.status;
        run.gasUsed = r.gasUsed.toString();
        run.gasCost = formatUnits(r.gasUsed * r.effectiveGasPrice, 18);
        assert.equal(r.status, "success");
        assert.ok(
          !(await c.getCode({
            address: owner.address,
            blockNumber: r.blockNumber,
          })),
        );
        run.checks = ["Temporary EIP-7702 delegation cleared."];
        save();
        console.log(`${n.name}: restored plain EOA ${hash}`);
      }
    }
  }
} catch (e) {
  const message = e instanceof Error ? e.message : String(e);
  console.error(
    message
      .replace(/https?:\/\/[^\s"']+/g, "[endpoint]")
      .replaceAll(key, "[private key]")
      .slice(0, 2500),
  );
  process.exitCode = 1;
} finally {
  await browser.close();
  save();
}
