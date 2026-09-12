import {
  addressSchema,
  canonicalDigest,
  canonicalJson,
  recordSchemas,
  type RecordKind,
  type Records,
} from "../../managed";
import { StoreDatabase, StoreError } from "./database";

type Row = { owner: string; revision: number; body: string };
export type PutOptions = { expectedRevision?: number; idempotencyKey?: string };

export class RecordStore {
  constructor(private readonly storage: StoreDatabase) {}
  private get db() {
    return this.storage.db;
  }
  private transaction<T>(fn: () => T): T {
    return this.storage.transaction(fn);
  }
  get<K extends RecordKind>(
    kind: K,
    id: string,
    owner: string,
  ): Records[K] | null {
    const row = this.db
      .prepare("SELECT body FROM records WHERE kind=? AND id=? AND owner=?")
      .get(kind, id, addressSchema.parse(owner)) as
      | { body: string }
      | undefined;
    return row
      ? (recordSchemas[kind].parse(JSON.parse(row.body)) as Records[K])
      : null;
  }
  list<K extends RecordKind>(
    kind: K,
    owner: string,
    groupId?: string,
  ): Records[K][] {
    const normalized = addressSchema.parse(owner);
    const rows =
      groupId === undefined
        ? this.db
            .prepare(
              "SELECT body FROM records WHERE kind=? AND owner=? ORDER BY id",
            )
            .all(kind, normalized)
        : this.db
            .prepare(
              "SELECT body FROM records WHERE kind=? AND owner=? AND group_id=? ORDER BY id",
            )
            .all(kind, normalized, groupId);
    return rows.map(
      (row) =>
        recordSchemas[kind].parse(JSON.parse(row.body as string)) as Records[K],
    );
  }
  revision(kind: RecordKind, id: string, owner: string): number | null {
    const row = this.db
      .prepare("SELECT revision FROM records WHERE kind=? AND id=? AND owner=?")
      .get(kind, id, addressSchema.parse(owner)) as
      | { revision: number }
      | undefined;
    return row?.revision ?? null;
  }
  put<K extends RecordKind>(
    kind: K,
    input: Records[K],
    owner: string,
    options: PutOptions = {},
  ): Records[K] {
    const record = recordSchemas[kind].parse(input) as Records[K];
    const normalized = addressSchema.parse(owner);
    if (record.owner !== normalized)
      throw new StoreError("FORBIDDEN", "Record owner does not match session.");
    return this.transaction(() => {
      const body = canonicalJson(record);
      if (options.idempotencyKey) {
        const saved = this.db
          .prepare(
            "SELECT digest,body FROM idempotency WHERE owner=? AND scope=? AND key=?",
          )
          .get(normalized, kind, options.idempotencyKey) as
          | { digest: string; body: string }
          | undefined;
        if (saved) {
          if (saved.digest !== canonicalDigest(record))
            throw new StoreError(
              "CONFLICT",
              "Idempotency key was used for a different request.",
            );
          return recordSchemas[kind].parse(
            JSON.parse(saved.body),
          ) as Records[K];
        }
      }
      const old = this.db
        .prepare(
          "SELECT owner,revision,body FROM records WHERE kind=? AND id=?",
        )
        .get(kind, record.id) as Row | undefined;
      if (old && old.owner !== normalized)
        throw new StoreError("NOT_FOUND", "Record not found.");
      if (
        options.expectedRevision !== undefined &&
        (old?.revision ?? 0) !== options.expectedRevision
      )
        throw new StoreError("CONFLICT", "Record revision changed.");
      this.validateLinks(kind, record, normalized, old);
      const revision = (old?.revision ?? 0) + 1;
      const groupId = "groupId" in record ? record.groupId : null;
      try {
        this.db
          .prepare(
            "INSERT INTO records(kind,id,owner,group_id,revision,body) VALUES(?,?,?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET revision=excluded.revision,body=excluded.body,group_id=excluded.group_id",
          )
          .run(kind, record.id, normalized, groupId, revision, body);
      } catch (error) {
        if (error instanceof Error && /UNIQUE constraint/.test(error.message))
          throw new StoreError(
            "CONFLICT",
            "An active group already owns this execution wallet and chain.",
          );
        throw error;
      }
      this.db
        .prepare(
          "INSERT INTO events(owner,kind,record_id,revision,created_at,body) VALUES(?,?,?,?,?,?)",
        )
        .run(normalized, kind, record.id, revision, Date.now(), body);
      if (options.idempotencyKey)
        this.db
          .prepare(
            "INSERT INTO idempotency(owner,scope,key,digest,body) VALUES(?,?,?,?,?)",
          )
          .run(
            normalized,
            kind,
            options.idempotencyKey,
            canonicalDigest(record),
            body,
          );
      return record;
    });
  }
  private validateLinks<K extends RecordKind>(
    kind: K,
    record: Records[K],
    owner: string,
    old?: Row,
  ) {
    const previous = old ? JSON.parse(old.body) : null;
    if ("groupId" in record) {
      const group = this.get("group", record.groupId, owner);
      if (!group) throw new StoreError("NOT_FOUND", "Parent group not found.");
      if (previous && previous.groupId !== record.groupId)
        throw new StoreError(
          "CONFLICT",
          "A record cannot move between groups.",
        );
      if ("maker" in record && record.maker !== group.maker)
        throw new StoreError("CONFLICT", "Maker differs from group.");
      if ("chainId" in record && record.chainId !== group.chainId)
        throw new StoreError("CONFLICT", "Chain differs from group.");
      for (const [field, target] of [
        ["botId", "bot"],
        ["planId", "plan"],
        ["reviewId", "review"],
      ] as const) {
        if (field in record) {
          const linked = this.get(
            target,
            (record as unknown as Record<string, string>)[field],
            owner,
          );
          if (!linked || linked.groupId !== record.groupId)
            throw new StoreError(
              "NOT_FOUND",
              "Linked record not found in group.",
            );
        }
      }
    }
    if (
      kind === "group" &&
      previous &&
      "maker" in record &&
      (previous.maker !== record.maker ||
        previous.chainId !== (record as Records["group"]).chainId)
    )
      throw new StoreError("CONFLICT", "Group maker and chain are immutable.");
  }
}
