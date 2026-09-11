// Explicit read-only integration command: npx tsx test/positions-live-read.ts
// Reads existing receipt fixtures. Never signs, simulates or submits transactions.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Address, Hex } from "viem";
import { AQUA, SWAP_VM } from "../lib/config";
import { client } from "../lib/server/rpc";
import { ManagedStore } from "../lib/server/store";
import {
  createObservationRepository,
  createPositionRpc,
  observeChain,
  reconcilePositions,
  recoverSubmittedTransactions,
  type PositionRef,
} from "../lib/server/positions";
try {
  process.loadEnvFile(".env");
} catch {
  /* Environment can be supplied by the caller. */
}
const fixture = JSON.parse(
  readFileSync("verification/live-execution.json", "utf8"),
) as {
  account: Address;
  runs: {
    chainId: number;
    mode: string;
    hash: Hex;
    strategies?: { hash: Hex; tokens: Address[] }[];
  }[];
};
const store = new ManagedStore(":memory:");
try {
  for (const chainId of [42161, 56, 4663]) {
    try {
      const run = fixture.runs.find(
        (item) => item.chainId === chainId && item.mode === "liquidity",
      )!;
      const publicClient = client(chainId);
      const rpc = createPositionRpc(publicClient);
      const receipt = await publicClient.getTransactionReceipt({
        hash: run.hash,
      });
      const [aquaCode, swapCode] = await Promise.all([
        publicClient.getCode({ address: AQUA }),
        publicClient.getCode({ address: SWAP_VM }),
      ]);
      assert.ok(aquaCode && aquaCode !== "0x");
      assert.ok(swapCode && swapCode !== "0x");
      const observation = await observeChain(
        rpc,
        createObservationRepository(store, fixture.account),
        {
          chainId,
          aqua: AQUA,
          swapVm: SWAP_VM,
          startBlock: receipt.blockNumber.toString(),
          confirmations: 2,
          chunkSize: 1,
        },
      );
      assert.equal(observation.error, null);
      const shipped = observation.events.filter(
        (event) =>
          event.transactionHash === run.hash && event.kind === "Shipped",
      );
      assert.equal(shipped.length, 2);
      const positions: PositionRef[] = run.strategies!.map(
        (strategy, index) => ({
          id: `live-${index}`,
          groupId: "live",
          ownerId: fixture.account,
          maker: fixture.account,
          chainId,
          app: SWAP_VM,
          strategyHash: strategy.hash,
          tokens: strategy.tokens,
        }),
      );
      const reconciliation = await reconcilePositions(rpc, positions, AQUA);
      const recovered = await recoverSubmittedTransactions(rpc, [run.hash], 2);
      console.log(
        JSON.stringify({
          chainId,
          checkedAt: reconciliation.checkedAt,
          deployedCodePresent: true,
          receiptHash: run.hash,
          indexedThrough: observation.indexedThrough,
          historicalHealth: observation.health,
          decodedShipped: shipped.length,
          currentBlock: reconciliation.block,
          rpcHealth: reconciliation.health,
          positions: reconciliation.positions.map((item) => ({
            hash: item.position.strategyHash,
            registration: item.registration,
            backing: item.backing,
          })),
          receiptStatus: recovered[0].status,
        }),
      );
    } catch {
      console.log(
        JSON.stringify({
          chainId,
          status: "unavailable",
          reason:
            "Read-only RPC verification failed; no endpoint or credential included.",
        }),
      );
      process.exitCode = 1;
    }
  }
} finally {
  store.close();
}
