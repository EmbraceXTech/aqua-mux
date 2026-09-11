import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import {
  decodeFunctionData,
  encodeFunctionData,
  keccak256,
  parseAbi,
  parseTransaction,
  type Hex,
} from "viem";
import { devAccount } from "./config";
import { implementationCode } from "./implementation-fixture";
import { implementation, signDevBatch } from "./signer";
import { AQUA, SWAP_VM } from "../../config";
import type { Plan } from "../../model";

test("real local signing preserves atomic calls, self authorization nonce and durable hash before broadcast", async () => {
  const original = { ...process.env };
  let actualChain = 56;
  let ownerCode = "0x";
  let targetCode: Hex = implementationCode;
  let nativeBalance = "0xde0b6b3a7640000";
  const broadcasts: Hex[] = [];
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    const rpc = JSON.parse(body);
    let result: unknown;
    switch (rpc.method) {
      case "eth_chainId":
        result = `0x${actualChain.toString(16)}`;
        break;
      case "eth_getCode":
        result =
          rpc.params[0].toLowerCase() === implementation.toLowerCase()
            ? targetCode
            : ownerCode;
        break;
      case "eth_getTransactionCount":
        result = "0x7";
        break;
      case "eth_estimateGas":
        result = "0x186a0";
        break;
      case "eth_call":
        result = "0x";
        break;
      case "eth_gasPrice":
        result = "0x3b9aca00";
        break;
      case "eth_getBalance":
        result = nativeBalance;
        break;
      case "eth_sendRawTransaction":
        broadcasts.push(rpc.params[0]);
        result = keccak256(rpc.params[0]);
        break;
      default:
        throw new Error(`Unexpected fixture RPC ${rpc.method}`);
    }
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    Object.assign(process.env, { NODE_ENV: "development" });
    process.env.AQUAMUX_DEV_WALLET = "true";
    // Public deterministic fixture only. Never load .env in this test.
    process.env.PRIVATE_KEY = "01".repeat(32);
    process.env.BNB_RPC_URL = `http://127.0.0.1:${address.port}`;
    process.env.AQUAMUX_DEV_WALLET_MAX_FEE_WEI = "1000000000000000";
    const account = devAccount();
    const plan: Plan = {
      account: account.address,
      chainId: 56,
      mode: "liquidity",
      createdAt: Date.now(),
      expiresAt: Date.now() + 60_000,
      calls: [
        {
          to: AQUA,
          value: "0x0",
          label: "Fixture dock",
          data: encodeFunctionData({
            abi: parseAbi([
              "function dock(address app,bytes32 strategyHash,address[] tokens)",
            ]),
            functionName: "dock",
            args: [SWAP_VM, `0x${"00".repeat(32)}`, []],
          }),
        },
      ],
      strategies: [],
      summary: [],
    };
    let checks = 0;
    const signed = await signDevBatch(plan, () => {
      checks++;
    });
    assert.equal(broadcasts.length, 0);
    assert.equal(signed.nonce, 7);
    assert.match(signed.hash, /^0x[0-9a-f]{64}$/);
    assert.equal(await signed.broadcast(), signed.hash);
    assert.equal(checks, 2);
    assert.equal(broadcasts.length, 1);
    const tx = parseTransaction(broadcasts[0]);
    assert.equal(tx.to?.toLowerCase(), account.address.toLowerCase());
    assert.equal(tx.chainId, 56);
    assert.equal(tx.nonce, 7);
    assert.equal(tx.type, "eip7702");
    assert.equal(tx.authorizationList?.[0].nonce, 8);
    assert.equal(tx.authorizationList?.[0].chainId, 56);
    assert.equal(
      tx.authorizationList?.[0].address.toLowerCase(),
      implementation.toLowerCase(),
    );
    const decoded = decodeFunctionData({
      abi: parseAbi([
        "function executeBatch((address target,uint256 value,bytes data)[] calls)",
      ]),
      data: tx.data!,
    });
    assert.equal(decoded.args[0].length, 1);
    assert.equal(decoded.args[0][0].data, plan.calls[0].data);
    assert.equal(decoded.args[0][0].target.toLowerCase(), AQUA);
    const blocked = await signDevBatch(plan, () => {
      if (++checks > 3) throw new Error("Stopped before broadcast");
    });
    await assert.rejects(blocked.broadcast, /Stopped/);
    assert.equal(broadcasts.length, 1);
    actualChain = 97;
    await assert.rejects(() => signDevBatch(plan, () => {}), /wrong chain/);
    actualChain = 56;
    ownerCode = "0xef01000000000000000000000000000000000000000001";
    await assert.rejects(
      () => signDevBatch(plan, () => {}),
      /unknown implementation/,
    );
    ownerCode = "0x";
    targetCode = "0x6000";
    await assert.rejects(() => signDevBatch(plan, () => {}), /not verified/);
    targetCode = implementationCode;
    await assert.rejects(
      () =>
        signDevBatch(
          { ...plan, gasReserveWei: "1000000000000000000" },
          () => {},
        ),
      /gas reserve/,
    );
    const balanceChanged = await signDevBatch(plan, () => {});
    nativeBalance = "0x0";
    let journalWrites = 0;
    await assert.rejects(
      () =>
        balanceChanged.broadcast(() => {
          journalWrites++;
        }),
      /gas reserve/,
    );
    assert.equal(journalWrites, 0);
    assert.equal(broadcasts.length, 1);
    nativeBalance = "0xde0b6b3a7640000";
    await assert.rejects(() => signDevBatch(plan, () => {}, 1n), /fee exceeds/);
    process.env.AQUAMUX_DEV_WALLET_MAX_FEE_WEI = "1";
    await assert.rejects(() => signDevBatch(plan, () => {}), /fee exceeds/);
    assert.equal(broadcasts.length, 1);
  } finally {
    process.env = original;
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
