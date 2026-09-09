import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeFunctionData, erc20Abi, toHex } from "viem";
import { buildPlan } from "../lib/server/plan";
import { tokens, classicRouter } from "../lib/config";
const account = "0x0000000000000000000000000000000000000001";
const catalog = tokens(4663);
const source = catalog.find((t) => t.symbol === "USDG")!;
const basket = {
  chainId: 4663,
  mode: "swap",
  source: source.address,
  amount: "0.1",
  slippageBps: 50,
  feeBps: 5,
  range: 0,
  legs: ["WETH", "PONS"].map((symbol) => ({
    address: catalog.find((t) => t.symbol === symbol)!.address,
    bps: 5000,
    amount: "0",
  })),
};

test("Robinhood ERC-20 approvals and swap calls target its verified router", async () => {
  const realFetch = globalThis.fetch,
    oldRpc = process.env.ROBINHOOD_RPC_URL,
    oldKey = process.env.ONEINCH_API_KEY;
  process.env.ROBINHOOD_RPC_URL = "http://rpc.fixture";
  process.env.ONEINCH_API_KEY = "fixture-key";
  let wrongTarget = false;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith("http://rpc.fixture")) {
      const request = JSON.parse(String(init?.body));
      const result =
        request.method === "eth_chainId"
          ? toHex(4663)
          : request.method === "eth_getCode"
            ? "0x1234"
            : request.method === "eth_call"
              ? toHex(
                  request.params[0].data.startsWith("0xdd62ed3e")
                    ? 0n
                    : 10n ** 18n,
                  { size: 32 },
                )
              : toHex(10n ** 18n);
      return Response.json({ jsonrpc: "2.0", id: request.id, result });
    }
    assert.ok(url.startsWith("https://api.1inch.com/swap/v6.1/4663/"));
    return Response.json({
      dstAmount: "1000000",
      tx: {
        to: classicRouter(wrongTarget ? 42161 : 4663),
        from: account,
        data: "0x12345678",
        value: "0",
      },
    });
  };
  try {
    const plan = await buildPlan(basket, account);
    assert.equal(plan.calls.length, 3);
    const approval = decodeFunctionData({
      abi: erc20Abi,
      data: plan.calls[0].data,
    });
    assert.equal(approval.functionName, "approve");
    assert.equal(String(approval.args?.[0]).toLowerCase(), classicRouter(4663));
    assert.ok(plan.calls.slice(1).every((c) => c.to === classicRouter(4663)));
    wrongTarget = true;
    await assert.rejects(
      () => buildPlan(basket, account),
      /unexpected transaction/,
    );
  } finally {
    globalThis.fetch = realFetch;
    if (oldRpc === undefined) delete process.env.ROBINHOOD_RPC_URL;
    else process.env.ROBINHOOD_RPC_URL = oldRpc;
    if (oldKey === undefined) delete process.env.ONEINCH_API_KEY;
    else process.env.ONEINCH_API_KEY = oldKey;
  }
});
