import assert from "node:assert/strict";
import { erc20Abi } from "viem";
import { AQUA, classicRouter } from "../../lib/config";
import type { LifecyclePlan, Token } from "../../lib/managed";
import { encodeDevBatch } from "../../lib/server/dev-wallet/batch";
import { aquaLifecycleAbi } from "../../lib/server/lifecycle/calls";
import type { controlledFork } from "./controlled-fork";

export async function verifyReplacementRollback(
  fork: Awaited<ReturnType<typeof controlledFork>>,
  previous: LifecyclePlan,
  replacement: LifecyclePlan,
  tokens: Token[],
) {
  const read = async () => ({
    positions: await Promise.all(
      [...previous.registrations, ...replacement.registrations].flatMap(
        (registration) =>
          registration.tokens.map((token) =>
            fork.rpc.readContract({
              address: AQUA,
              abi: aquaLifecycleAbi,
              functionName: "rawBalances",
              args: [
                previous.maker,
                registration.app,
                registration.hash,
                token,
              ],
            }),
          ),
      ),
    ),
    balances: await Promise.all(
      tokens.map((token) =>
        fork.rpc.readContract({
          address: token.address,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [previous.maker],
        }),
      ),
    ),
  });
  const before = await read();
  // Submit an intentionally invalid batch only to the isolated fork, bypassing the production adapter.
  const hash = await fork.wallet.sendTransaction({
    to: previous.maker,
    data: encodeDevBatch([
      ...replacement.calls,
      {
        to: classicRouter(previous.chainId),
        data: "0xdeadbeef",
        value: "0x0",
        label: "Intentional final-call failure",
      },
    ]),
    gas: 3000000n,
  });
  assert.equal(
    (await fork.rpc.waitForTransactionReceipt({ hash })).status,
    "reverted",
  );
  assert.deepEqual(
    await read(),
    before,
    "Failed replacement must preserve old registrations, virtual reserves and actual token balances",
  );
  return { hash, oldPositionsAndInventoryRestored: true };
}
