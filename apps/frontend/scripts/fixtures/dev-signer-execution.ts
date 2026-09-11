import assert from "node:assert/strict";
import { toHex } from "viem";
import type { LifecyclePlan } from "../../lib/managed";
import type { ManagedStore } from "../../lib/server/store";
import { managedSigningBatch } from "../../lib/server/dev-wallet/managed-plan";
import {
  signDevBatch,
  implementation,
} from "../../lib/server/dev-wallet/signer";
import { verifyManagedTransactionProof } from "../../lib/server/managed-service/transaction-proof";
import type { controlledFork } from "./controlled-fork";

/** Execute the initial local type-4 authorization on an isolated snapshot only. */
export async function verifyDevSignerExecution(
  fork: Awaited<ReturnType<typeof controlledFork>>,
  plan: LifecyclePlan,
  store: ManagedStore,
) {
  const names = [
    "NODE_ENV",
    "PRIVATE_KEY",
    "AQUAMUX_DEV_WALLET",
    "AQUAMUX_DEV_WALLET_MAX_FEE_WEI",
  ];
  const saved = names.map((name) => process.env[name]);
  const snapshot = await fork.request("evm_snapshot", []);
  try {
    process.env.NODE_ENV = "development";
    process.env.PRIVATE_KEY = "11".repeat(32);
    process.env.AQUAMUX_DEV_WALLET = "true";
    process.env.AQUAMUX_DEV_WALLET_MAX_FEE_WEI = "100000000000000000";
    await fork.request("anvil_setCode", [plan.maker, "0x"]);
    const signed = await signDevBatch(
      managedSigningBatch(plan, store),
      () => {},
    );
    const code = await fork.rpc.getCode({ address: implementation });
    let broadcastCallback = false;
    await fork.request("anvil_setCode", [implementation, "0x00"]);
    await assert.rejects(
      signed.broadcast(() => {
        broadcastCallback = true;
      }),
      /account code or nonce changed/,
    );
    assert.equal(broadcastCallback, false);
    await fork.request("anvil_setCode", [implementation, code]);
    await fork.request("anvil_setNonce", [plan.maker, toHex(signed.nonce + 1)]);
    await assert.rejects(
      signed.broadcast(() => {
        broadcastCallback = true;
      }),
      /account code or nonce changed/,
    );
    assert.equal(broadcastCallback, false);
    await fork.request("anvil_setNonce", [plan.maker, toHex(signed.nonce)]);
    const hash = await signed.broadcast();
    const receipt = await fork.rpc.waitForTransactionReceipt({ hash });
    assert.equal(receipt.status, "success");
    const tx = await fork.rpc.getTransaction({ hash });
    assert.equal(tx.type, "eip7702");
    assert.equal(await verifyManagedTransactionProof(fork.rpc, tx, plan), true);
    return {
      hash,
      initialSelfAuthorizationProved: true,
      changedCodeAndNonceRefused: true,
    };
  } finally {
    await fork.request("evm_revert", [snapshot]);
    names.forEach((name, index) => {
      if (saved[index] === undefined) delete process.env[name];
      else process.env[name] = saved[index];
    });
  }
}
