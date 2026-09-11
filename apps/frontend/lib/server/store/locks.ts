import {
  addressSchema,
  chainIdSchema,
  idSchema,
  timestampSchema,
} from "../../managed";
import { RecordStore } from "./record-store";
import { StoreDatabase, StoreError } from "./database";

export type ExecutionLock = {
  chainId: number;
  maker: string;
  owner: string;
  holder: string;
  fence: number;
  expiresAt: number;
  unresolved: boolean;
};
type LockRow = {
  owner: string;
  holder: string;
  fence: number;
  expires_at: number;
  unresolved: number;
};
export class LockStore {
  constructor(
    private readonly storage: StoreDatabase,
    private readonly records: RecordStore,
  ) {}
  private get db() {
    return this.storage.db;
  }
  private transaction<T>(fn: () => T): T {
    return this.storage.transaction(fn);
  }
  acquireExecutionLock(
    chainId: number,
    maker: string,
    owner: string,
    holder: string,
    ttlMs: number,
  ): ExecutionLock {
    chainIdSchema.parse(chainId);
    maker = addressSchema.parse(maker);
    owner = addressSchema.parse(owner);
    idSchema.parse(holder);
    if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0 || ttlMs > 300000)
      throw new Error(
        "Execution lock duration must be between 1 and 300000 milliseconds.",
      );
    return this.transaction(() => {
      const group = this.records
        .list("group", owner)
        .find(
          (v) =>
            v.chainId === chainId && v.maker === maker && v.state !== "closed",
        );
      if (!group && maker !== owner)
        throw new StoreError("NOT_FOUND", "Execution group not found.");
      const now = Date.now();
      const old = this.db
        .prepare("SELECT * FROM execution_locks WHERE chain_id=? AND maker=?")
        .get(chainId, maker) as LockRow | undefined;
      if (old && (old.unresolved || old.expires_at > now))
        throw new StoreError(
          "LOCKED",
          "Execution wallet has an active or unresolved attempt.",
        );
      const fence = (old?.fence ?? 0) + 1;
      const expiresAt = timestampSchema.parse(now + ttlMs);
      this.db
        .prepare(
          "INSERT INTO execution_locks(chain_id,maker,owner,holder,fence,expires_at,unresolved) VALUES(?,?,?,?,?,?,0) ON CONFLICT(chain_id,maker) DO UPDATE SET owner=excluded.owner,holder=excluded.holder,fence=excluded.fence,expires_at=excluded.expires_at,unresolved=0",
        )
        .run(chainId, maker, owner, holder, fence, expiresAt);
      return {
        chainId,
        maker,
        owner,
        holder,
        fence,
        expiresAt,
        unresolved: false,
      };
    });
  }
  assertExecutionLock(
    lock: ExecutionLock,
    options: { allowUnresolved?: boolean } = {},
  ) {
    const row = this.db
      .prepare(
        "SELECT * FROM execution_locks WHERE chain_id=? AND maker=? AND owner=? AND holder=? AND fence=?",
      )
      .get(
        lock.chainId,
        addressSchema.parse(lock.maker),
        addressSchema.parse(lock.owner),
        lock.holder,
        lock.fence,
      ) as LockRow | undefined;
    if (
      !row ||
      row.expires_at <= Date.now() ||
      (row.unresolved && !options.allowUnresolved)
    )
      throw new StoreError(
        "LOCKED",
        "Execution lock is stale or submission needs reconciliation.",
      );
  }
  markExecutionUnresolved(lock: ExecutionLock) {
    this.transaction(() => {
      this.assertExecutionLock(lock);
      this.db
        .prepare(
          "UPDATE execution_locks SET unresolved=1 WHERE chain_id=? AND maker=? AND fence=?",
        )
        .run(lock.chainId, lock.maker, lock.fence);
    });
  }
  /** Call only after receipt reconciliation, including ambiguous broadcast outcomes. */
  releaseExecutionLock(lock: ExecutionLock) {
    const result = this.db
      .prepare(
        "UPDATE execution_locks SET expires_at=0,unresolved=0 WHERE chain_id=? AND maker=? AND owner=? AND holder=? AND fence=?",
      )
      .run(
        lock.chainId,
        addressSchema.parse(lock.maker),
        addressSchema.parse(lock.owner),
        lock.holder,
        lock.fence,
      );
    if (result.changes !== 1)
      throw new StoreError("LOCKED", "Execution lock fence changed.");
  }
}
