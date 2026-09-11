import { randomUUID } from "node:crypto";
import type { DevWalletOutcome, DevWalletReview } from "../../dev-wallet";
import { buildPlan } from "../plan";
import {
  openManagedStore,
  type ExecutionLock,
  type ManagedStore,
} from "../store";
import { DevWalletError } from "./config";
import { planDigest, validateDevPlan } from "./policy";
import { devReceipt, maxFeeBudget, signDevBatch } from "./signer";
import type { DevSession } from "./session";

const reviews = "dev-wallet-review";
const operations = "dev-wallet-operation";
type Review = DevWalletReview & { sessionId: string; maxFeeWei: string };
type Operation = DevWalletOutcome & {
  chainId: number;
  nonce?: number;
  lock: ExecutionLock;
  phase: "preparing" | "broadcast" | "settled" | "refused";
};

// Dependency injection is server-only and keeps tests off real networks and real keys.
export class DevBasketService {
  constructor(
    private readonly store: ManagedStore = openManagedStore(),
    private readonly compile = buildPlan,
    private readonly sign = signDevBatch,
    private readonly receipt = devReceipt,
    private readonly feeBudget = maxFeeBudget,
  ) {}

  async prepare(
    session: DevSession,
    basket: unknown,
  ): Promise<DevWalletReview> {
    const plan = await this.compile(basket, session.owner);
    validateDevPlan(plan, session.owner);
    const review = {
      id: randomUUID(),
      digest: planDigest(plan),
      plan,
      sessionId: session.sessionId,
      maxFeeWei: String(this.feeBudget()),
    };
    this.store.putDocument(reviews, review.id, session.owner, review, 0);
    return {
      id: review.id,
      digest: review.digest,
      plan,
      maxFeeWei: review.maxFeeWei,
    };
  }

  async execute(
    session: DevSession,
    id: string,
    digest: string,
    assertSession: () => void,
  ): Promise<DevWalletOutcome> {
    const review = this.store.getDocument<Review>(
      reviews,
      id,
      session.owner,
    )?.data;
    if (
      !review ||
      review.sessionId !== session.sessionId ||
      review.digest !== digest ||
      planDigest(review.plan) !== digest
    )
      throw new DevWalletError(
        "The local wallet review changed or is unavailable.",
      );
    const previous = this.store.getDocument<Operation>(
      operations,
      id,
      session.owner,
    )?.data;
    if (previous) return this.outcome(previous);
    validateDevPlan(review.plan, session.owner);
    const operation = this.store.transaction(() => {
      if (this.store.getDocument(operations, id, session.owner))
        throw new DevWalletError(
          "This review already has an execution attempt.",
        );
      const lock = this.store.acquireExecutionLock(
        review.plan.chainId,
        session.owner,
        session.owner,
        id,
        120_000,
      );
      const operation: Operation = {
        id,
        chainId: review.plan.chainId,
        state: "unknown",
        phase: "preparing",
        lock,
      };
      this.store.putDocument(operations, id, session.owner, operation, 0);
      return operation;
    });
    let journaled = false;
    const assertCurrent = () => {
      assertSession();
      validateDevPlan(review.plan, session.owner);
      // A journaled attempt holds its lock indefinitely until receipt reconciliation.
      this.store.assertExecutionLock(operation.lock, {
        allowUnresolved: journaled,
      });
    };
    try {
      const signed = await this.sign(
        review.plan,
        assertCurrent,
        BigInt(review.maxFeeWei),
      );
      // Never retry automatically. Even transport rejection can mean a node accepted it.
      await signed.broadcast(() => {
        this.store.transaction(() => {
          assertCurrent();
          this.store.markExecutionUnresolved(operation.lock);
          Object.assign(operation, {
            transactionHash: signed.hash,
            nonce: signed.nonce,
            phase: "broadcast",
            state: "unknown",
          });
          this.store.putDocument(operations, id, session.owner, operation);
        });
        journaled = true;
      });
      operation.state = "pending";
      this.store.putDocument(operations, id, session.owner, operation);
      return this.outcome(operation);
    } catch (error) {
      if (journaled) return this.outcome(operation);
      operation.phase = "refused";
      this.store.transaction(() => {
        this.store.putDocument(operations, id, session.owner, operation);
        this.store.releaseExecutionLock(operation.lock);
      });
      throw error;
    }
  }

  async status(session: DevSession, id: string): Promise<DevWalletOutcome> {
    const operation = this.store.getDocument<Operation>(
      operations,
      id,
      session.owner,
    )?.data;
    if (!operation)
      throw new DevWalletError("Local wallet execution not found.");
    if (operation.transactionHash && operation.phase === "broadcast") {
      const observed = await this.receipt(
        operation.chainId,
        operation.transactionHash,
      );
      // An absent receipt cannot turn an ambiguous broadcast into confirmed submission.
      operation.state =
        observed === "pending" && operation.state === "unknown"
          ? "unknown"
          : observed;
      this.store.transaction(() => {
        if (observed === "confirmed" || observed === "reverted") {
          operation.phase = "settled";
          this.store.releaseExecutionLock(operation.lock);
        }
        this.store.putDocument(operations, id, session.owner, operation);
      });
    }
    return this.outcome(operation);
  }

  private outcome(operation: Operation): DevWalletOutcome {
    return {
      id: operation.id,
      state: operation.state,
      ...(operation.transactionHash
        ? { transactionHash: operation.transactionHash }
        : {}),
    };
  }
}
