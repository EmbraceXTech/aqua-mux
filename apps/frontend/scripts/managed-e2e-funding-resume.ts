import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { type Hex } from "viem";
import { client } from "../lib/server/rpc";

const SOURCE = "0xa9aa0af420578223b11ff5430d428055c52e8c89";
const DESTINATION = "0x992a6a939579e10ad47c347a5be3788c94992dd4";
const HASH =
  "0x1b1aaf05d8825eaa821b731b94639009d061dbea2a84b4fc6d71e676c28a3347";

// This recovery is deliberately limited to the observed Arbitrum-only attempt.
// It reads public evidence and RPC state, and cannot sign or send.
export async function reconcileFundingPrefix(path: string) {
  const bytes = readFileSync(path);
  const prior = JSON.parse(bytes.toString()) as {
    source: string;
    destination: string;
    attempts: { chainId: number; hash: Hex; state: string }[];
  };
  assert.equal(prior.source.toLowerCase(), SOURCE);
  assert.equal(prior.destination.toLowerCase(), DESTINATION);
  assert.equal(prior.attempts.length, 1);
  assert.equal(prior.attempts[0].chainId, 42161);
  assert.equal(prior.attempts[0].hash, HASH);
  assert.equal(prior.attempts[0].state, "confirmed");
  const rpc = client(42161);
  assert.equal(await rpc.getChainId(), 42161);
  const transaction = await rpc.getTransaction({ hash: HASH });
  const receipt = await rpc.getTransactionReceipt({ hash: HASH });
  assert.equal(transaction.from.toLowerCase(), SOURCE);
  assert.equal(transaction.to?.toLowerCase(), DESTINATION);
  assert.equal(transaction.value, 1_500_000_000_000_000n);
  assert.equal(transaction.input, "0x");
  assert.equal(transaction.nonce, 8);
  assert.equal(transaction.authorizationList?.length ?? 0, 0);
  assert.equal(receipt.status, "success");
  assert.equal(
    (await rpc.getBlock({ blockNumber: receipt.blockNumber })).hash,
    receipt.blockHash,
  );
  assert.equal(
    await rpc.getBalance({
      address: DESTINATION,
      blockNumber: receipt.blockNumber,
    }),
    transaction.value,
  );
  for (const [chainId, nonce] of [
    [56, 5],
    [4663, 6],
  ]) {
    const pendingRpc = client(chainId);
    assert.equal(await pendingRpc.getChainId(), chainId);
    assert.equal(
      await pendingRpc.getTransactionCount({
        address: SOURCE,
        blockTag: "latest",
      }),
      nonce,
    );
    assert.equal(
      await pendingRpc.getTransactionCount({
        address: SOURCE,
        blockTag: "pending",
      }),
      nonce,
    );
    assert.equal(await pendingRpc.getBalance({ address: DESTINATION }), 0n);
    assert.equal(
      await pendingRpc.getTransactionCount({
        address: DESTINATION,
        blockTag: "pending",
      }),
      0,
    );
  }
  return {
    path,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    confirmedHash: HASH,
  };
}
