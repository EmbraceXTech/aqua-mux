import { AQUA, SWAP_VM } from "../../config";
import { openManagedStore, type ExecutionLock } from "../store";
import { client } from "../rpc";
import { verifyManagedTransactionProof } from "./transaction-proof";
import type { StrategyConfig } from "../../managed";
import {
  createPositionRpc,
  recoverSubmittedTransactions,
  reconcilePositions,
  toPositionRef,
  createObservationRepository,
  observeChain,
  observationKey,
  getPositionHistory,
  type ChainObservationConfig,
} from "../positions";
import { groupBot, ownedGroup } from "./groups";

import { pauseBot } from "../automation/lease";

export async function reconcileManagedTransactions(
  owner: string,
  groupId: string,
) {
  const store = openManagedStore(),
    group = ownedGroup(store, owner, groupId),
    rpc = client(group.chainId);
  const attempts = store
    .list("transaction", owner, groupId)
    .filter(
      (a) => ["submitted", "unknown"].includes(a.status) && a.transactionHash,
    );
  const confirmations = Number(
    process.env[`AQUAMUX_CONFIRMATIONS_${group.chainId}`] ?? 1,
  );
  const results = await recoverSubmittedTransactions(
    createPositionRpc(rpc),
    attempts.map((a) => a.transactionHash!),
    confirmations,
  );
  for (const result of results) {
    const attempt = attempts.find((a) => a.transactionHash === result.hash)!;
    const plan = store.get("plan", attempt.planId, owner)!;
    if (result.status === "confirmed") {
      // Only this verified batch format can prove that the recorded plan executed.
      try {
        const tx = await rpc.getTransaction({ hash: result.hash });
        if (!(await verifyManagedTransactionProof(rpc, tx, plan)))
          result.status = "unknown";
      } catch {
        result.status = "unknown";
      }
    }
    store.transaction(() => {
      const current = store.get("transaction", attempt.id, owner)!;
      if (!["submitted", "unknown"].includes(current.status)) return;
      store.put(
        "transaction",
        {
          ...current,
          status: result.status,
          receipt: { ...result, confirmations },
        },
        owner,
      );
      if (result.status !== "confirmed" && result.status !== "failed") return;
      if (result.status === "confirmed") {
        for (const retirement of plan.retirements) {
          const old = store
            .list("strategy", owner, groupId)
            .find((s) => s.hash === retirement.hash);
          if (old) store.put("strategy", { ...old, state: "docked" }, owner);
        }
        for (const registration of plan.registrations) {
          const id = `${groupId}:strategy:${registration.hash}`;
          const replaced = registration.replaces
            ? store
                .list("strategy", owner, groupId)
                .find((s) => s.hash === registration.replaces)
            : null;
          store.put(
            "strategy",
            {
              id,
              owner: group.owner,
              groupId,
              maker: group.maker,
              app: registration.app,
              hash: registration.hash,
              tokens: registration.tokens.map(
                (t) =>
                  group.config.pairs
                    .flatMap((pair) => [pair.baseToken, pair.quoteToken])
                    .find((token) => token.address === t)!,
              ),
              program: registration.program,
              registrationBlock: result.blockNumber,
              replaces: replaced?.id ?? null,
              replacedBy: null,
              state: "active",
            },
            owner,
          );
          if (replaced)
            store.put(
              "strategy",
              { ...replaced, state: "docked", replacedBy: id },
              owner,
            );
        }
        const currentGroup = ownedGroup(store, owner, groupId);
        const config = store.getDocument<StrategyConfig>(
          "plan-configuration",
          plan.id,
          owner,
        )?.data;
        if (config && plan.registrations.length)
          store.putDocument("active-configuration", groupId, owner, {
            config,
            confirmedAt: Date.now(),
          });
        const closed =
          plan.kind === "close" || plan.kind === "close-and-convert";
        store.put(
          "group",
          {
            ...currentGroup,
            // Estimates do not establish inventory attribution after execution or fills.
            inventory: [],
            state: closed ? "closed" : "active",
            updatedAt: Date.now(),
          },
          owner,
        );
        if (closed)
          store.put(
            "bot",
            {
              ...pauseBot(
                groupBot(store, owner, groupId),
                "Positions closed by owner.",
              ),
              state: "stopped",
            },
            owner,
          );
      }
      const lock = store.getDocument<ExecutionLock>(
        "attempt-lock",
        attempt.id,
        owner,
      )?.data;
      if (lock) store.releaseExecutionLock(lock);
    });
  }
  return store.list("transaction", owner, groupId);
}
export async function observeManagedGroup(owner: string, groupId: string) {
  const store = openManagedStore(),
    group = ownedGroup(store, owner, groupId),
    rpc = createPositionRpc(client(group.chainId));
  const refs = store
    .list("strategy", owner, groupId)
    .map((s) => toPositionRef(group, s));
  const positions = await reconcilePositions(rpc, refs, AQUA);
  const repository = createObservationRepository(store, owner);
  const start = process.env[`AQUAMUX_START_BLOCK_${group.chainId}`];
  const confirmations = Number(
    process.env[`AQUAMUX_CONFIRMATIONS_${group.chainId}`] ?? 1,
  );
  let observation = null;
  if (start && /^\d+$/.test(start)) {
    const config: ChainObservationConfig = {
      chainId: group.chainId,
      aqua: AQUA,
      swapVm: SWAP_VM,
      startBlock: start,
      confirmations,
      chunkSize: 2000,
    };
    await observeChain(rpc, repository, config);
    observation = repository.read(observationKey(config))?.value ?? null;
  }
  const history = getPositionHistory(observation, refs, owner, groupId);
  const result = JSON.parse(
    JSON.stringify({ positions, history, observation }, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value,
    ),
  );
  store.putDocument("group-observation", groupId, owner, result);
  return result;
}
