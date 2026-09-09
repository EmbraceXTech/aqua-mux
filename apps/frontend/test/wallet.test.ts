import { test } from "node:test";
import assert from "node:assert/strict";
import { submitPlan, type Provider } from "../lib/wallet";
import type { Plan } from "../lib/model";
const account = "0x0000000000000000000000000000000000000001";
const fresh = (): Plan => ({
  chainId: 42161,
  account,
  mode: "liquidity",
  calls: [{ to: account, data: "0x", value: "0x0", label: "Fixture call" }],
  strategies: [],
  summary: [],
  createdAt: Date.now(),
  expiresAt: Date.now() + 10000,
});
function install(request: Provider["request"]) {
  Object.assign(globalThis, { window: { ethereum: { request } } });
}
test("atomic batch is explicitly required and never falls back to sequential transactions", async () => {
  const seen: { method: string; params?: unknown[] }[] = [];
  install(async (a) => {
    seen.push(a);
    if (a.method === "eth_chainId") return "0xa4b1";
    if (a.method === "eth_accounts") return [account];
    if (a.method === "wallet_getCapabilities")
      return { "0xa4b1": { atomic: { status: "supported" } } };
    if (a.method === "wallet_sendCalls") {
      assert.equal(
        (a.params![0] as { atomicRequired: boolean }).atomicRequired,
        true,
      );
      return { id: "batch-1" };
    }
    throw Error("Unexpected method");
  });
  assert.equal(await submitPlan(fresh()), "batch-1");
  assert.ok(!seen.some((s) => s.method === "eth_sendTransaction"));
});
test("unsupported wallets cannot send any calls", async () => {
  const seen: string[] = [];
  install(async (a) => {
    seen.push(a.method);
    if (a.method === "eth_chainId") return "0xa4b1";
    if (a.method === "eth_accounts") return [account];
    return { "0xa4b1": { atomic: { status: "unsupported" } } };
  });
  await assert.rejects(
    () => submitPlan(fresh()),
    /Atomic transactions are unavailable/,
  );
  assert.ok(!seen.includes("wallet_sendCalls"));
});
test("expired reviews and changed accounts stop before submitting", async () => {
  let sends = 0;
  install(async (a) => {
    if (a.method === "wallet_sendCalls") sends++;
    if (a.method === "eth_chainId") return "0xa4b1";
    return ["0x0000000000000000000000000000000000000002"];
  });
  await assert.rejects(
    () => submitPlan({ ...fresh(), expiresAt: 1 }),
    /expired/,
  );
  await assert.rejects(() => submitPlan(fresh()), /account changed/);
  assert.equal(sends, 0);
});
