import type { LifecyclePlan } from "@/lib/managed";
import type { Basket, Plan } from "@/lib/model";
import {
  batchStatus,
  normalizeBatchStatus,
  submitPlan,
  type BatchStatus,
  type WalletOutcome,
} from "@/lib/wallet";
import {
  connectDevWallet,
  devWalletStatus,
  disconnectDevWallet,
  prepareDevWalletPlan,
  prepareDevWalletLifecyclePlan,
  submitDevWalletPlan,
} from "@/lib/dev-wallet";
import { authenticateWallet, managedRequest, type ManagedSession } from "./api";
import { submitExternalManaged } from "./external-execution";

export type WalletMode = ManagedSession["mode"];
export type WalletExecutionStatus = {
  state: WalletOutcome;
  transactionHash?: `0x${string}`;
  receipts?: { transactionHash: `0x${string}`; status: string }[];
};
export type PreparedWalletPlan = {
  plan: Plan;
  review?: { id: string; digest: string };
};
export type ManagedExecutionInput = {
  plan: LifecyclePlan;
  tabSession: string;
  assertCurrent: () => void;
  externalExecutionVerified: boolean;
};
export type ManagedExecutionResult = {
  notice: string;
};

type WalletExecutor = {
  observesBrowserWallet: boolean;
  assertManagedExecution: (input: ManagedExecutionInput) => void;
  connect: (chainId: number) => Promise<ManagedSession>;
  disconnect: (session: ManagedSession) => Promise<void>;
  prepare: (
    session: ManagedSession,
    basket: Basket,
  ) => Promise<PreparedWalletPlan>;
  submit: (
    session: ManagedSession,
    prepared: PreparedWalletPlan,
  ) => Promise<{ id: string; status: WalletExecutionStatus }>;
  status: (
    session: ManagedSession,
    id: string,
  ) => Promise<WalletExecutionStatus>;
  submitManaged: (
    session: ManagedSession,
    input: ManagedExecutionInput,
  ) => Promise<ManagedExecutionResult>;
};

function assertExternalManagedExecution(input: ManagedExecutionInput) {
  if (!input.externalExecutionVerified)
    throw new Error(
      "Managed execution is unavailable for this external wallet until its account adapter and receipt recovery are verified.",
    );
}

function browserStatus(status: BatchStatus): WalletExecutionStatus {
  const state = normalizeBatchStatus(status);
  const receipts = status.receipts?.filter(
    (receipt): receipt is { transactionHash: `0x${string}`; status: string } =>
      /^0x[0-9a-fA-F]{64}$/.test(receipt.transactionHash) &&
      (receipt.status === "0x0" || receipt.status === "0x1"),
  );
  return { state, ...(receipts?.length ? { receipts } : {}) };
}

const executors: Record<WalletMode, WalletExecutor> = {
  external: {
    observesBrowserWallet: true,
    assertManagedExecution: assertExternalManagedExecution,
    connect: authenticateWallet,
    disconnect: async (session) => {
      await managedRequest("/api/auth/logout", session, {});
    },
    prepare: async (session, basket) => ({
      plan: await managedRequest<Plan>("/api/plan", session, {
        basket,
        account: session.owner,
      }),
    }),
    submit: async (_session, prepared) => ({
      id: await submitPlan(prepared.plan),
      status: { state: "pending" },
    }),
    status: async (_session, id) => browserStatus(await batchStatus(id)),
    submitManaged: async (session, input) => {
      assertExternalManagedExecution(input);
      const attempt = await submitExternalManaged(
        session,
        input.plan,
        input.tabSession,
        input.assertCurrent,
      );
      return {
        notice: `Wallet transaction ${attempt.status}: ${attempt.transactionHash ?? "hash unavailable"}. Reconcile before taking another action.`,
      };
    },
  },
  "local-development": {
    observesBrowserWallet: false,
    assertManagedExecution: () => {},
    connect: async () => {
      const result = await connectDevWallet();
      return {
        token: result.token,
        owner: result.account,
        expiresAt: result.expiresAt,
        sessionId: crypto.randomUUID(),
        mode: "local-development",
        maxFeeWei: result.maxFeeWei,
      };
    },
    disconnect: async (session) => {
      await disconnectDevWallet(session.token);
    },
    prepare: async (session, basket) => {
      const review = await prepareDevWalletPlan(session.token, basket);
      return {
        plan: review.plan,
        review: { id: review.id, digest: review.digest },
      };
    },
    submit: async (session, prepared) => {
      if (!prepared.review)
        throw new Error("Review the local development wallet plan again.");
      const outcome = await submitDevWalletPlan(
        session.token,
        prepared.review,
        true,
      );
      return {
        id: outcome.id,
        status: {
          state: outcome.state,
          ...(outcome.transactionHash
            ? { transactionHash: outcome.transactionHash }
            : {}),
        },
      };
    },
    status: async (session, id) => {
      const outcome = await devWalletStatus(session.token, id);
      return {
        state: outcome.state,
        ...(outcome.transactionHash
          ? { transactionHash: outcome.transactionHash }
          : {}),
      };
    },
    submitManaged: async (session, input) => {
      const approved = await prepareDevWalletLifecyclePlan(
        session.token,
        input.plan.id,
        {
          sessionId: input.tabSession,
          generation: input.plan.runGeneration,
        },
      );
      input.assertCurrent();
      if (!session.maxFeeWei || approved.maxFeeWei !== session.maxFeeWei)
        throw new Error(
          "Development signer fee cap changed. Reconnect and review the updated cap before signing.",
        );
      const outcome = await submitDevWalletPlan(session.token, approved, true);
      return {
        notice: `Development signer returned ${outcome.state}. Reconcile to verify the position and remaining inventory.`,
      };
    },
  },
};

export function walletExecutor(mode: WalletMode) {
  return executors[mode];
}
