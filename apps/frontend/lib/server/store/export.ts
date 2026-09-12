import { addressSchema, recordSchemas, type RecordKind } from "../../managed";
import { LockStore } from "./locks";
import { StoreDatabase } from "./database";
import { RecordStore } from "./record-store";
import { DocumentStore } from "./documents";

const sensitiveKey =
  /private.?key|secret|password|credential|authorization|signature|signed|raw.?transaction|token_hash|bearer|cookie|calldata|^data$|settlementProof|receipt|snapshot/i;
export function redactExport(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactExport);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !sensitiveKey.test(key))
        .map(([key, entry]) => [key, redactExport(entry)]),
    );
  return value;
}
export class ManagedStore extends StoreDatabase {
  private readonly records = new RecordStore(this);
  private readonly documents = new DocumentStore(this);
  private readonly locks = new LockStore(this, this.records);
  readonly get = this.records.get.bind(this.records);
  readonly list = this.records.list.bind(this.records);
  readonly put = this.records.put.bind(this.records);
  readonly revision = this.records.revision.bind(this.records);
  readonly getDocument = this.documents.getDocument.bind(this.documents);
  readonly putDocument = this.documents.putDocument.bind(this.documents);
  readonly listDocuments = this.documents.listDocuments.bind(this.documents);
  readonly acquireExecutionLock = this.locks.acquireExecutionLock.bind(
    this.locks,
  );
  readonly assertExecutionLock = this.locks.assertExecutionLock.bind(
    this.locks,
  );
  readonly markExecutionUnresolved = this.locks.markExecutionUnresolved.bind(
    this.locks,
  );
  readonly releaseExecutionLock = this.locks.releaseExecutionLock.bind(
    this.locks,
  );
  history(owner: string, groupId?: string) {
    const normalized = addressSchema.parse(owner);
    if (groupId && !this.get("group", groupId, normalized)) return [];
    const rows = groupId
      ? this.db
          .prepare(
            "SELECT sequence,kind,record_id,revision,created_at,body FROM events WHERE owner=? AND (json_extract(body,'$.groupId')=? OR (kind='group' AND record_id=?)) ORDER BY sequence",
          )
          .all(normalized, groupId, groupId)
      : this.db
          .prepare(
            "SELECT sequence,kind,record_id,revision,created_at,body FROM events WHERE owner=? ORDER BY sequence",
          )
          .all(normalized);
    return rows.map((row) => ({
      sequence: Number(row.sequence),
      kind: row.kind as RecordKind,
      recordId: row.record_id as string,
      revision: Number(row.revision),
      createdAt: Number(row.created_at),
      record: JSON.parse(row.body as string) as unknown,
    }));
  }
  exportOwner(owner: string) {
    const normalized = addressSchema.parse(owner);
    const records = Object.fromEntries(
      (Object.keys(recordSchemas) as RecordKind[]).map((kind) => [
        kind,
        this.list(kind, normalized),
      ]),
    );
    const proposalReviews = this.listDocuments<{
      response?: { review?: unknown };
    }>("proposal-intents", normalized).flatMap(({ data }) => {
      const review = recordSchemas.review.safeParse(data.response?.review);
      return review.success ? [review.data] : [];
    });
    // Export validated user reviews, never internal intent, session or idempotency documents.
    return redactExport({
      schemaVersion: 1,
      owner: normalized,
      exportedAt: Date.now(),
      records,
      proposalReviews,
      events: this.history(normalized),
    });
  }
}
