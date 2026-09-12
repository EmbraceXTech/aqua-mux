import { addressSchema, canonicalJson, idSchema } from "../../managed";
import { StoreDatabase, StoreError } from "./database";

export type StoredDocument<T = unknown> = {
  id: string;
  revision: number;
  data: T;
};
export class DocumentStore {
  constructor(private readonly storage: StoreDatabase) {}
  private get db() {
    return this.storage.db;
  }
  private transaction<T>(fn: () => T): T {
    return this.storage.transaction(fn);
  }
  getDocument<T = unknown>(
    namespace: string,
    id: string,
    owner: string,
  ): StoredDocument<T> | null {
    const row = this.db
      .prepare(
        "SELECT revision,body FROM documents WHERE namespace=? AND id=? AND owner=?",
      )
      .get(
        idSchema.parse(namespace),
        idSchema.parse(id),
        addressSchema.parse(owner),
      ) as { revision: number; body: string } | undefined;
    return row
      ? { id, revision: row.revision, data: JSON.parse(row.body) as T }
      : null;
  }
  listDocuments<T = unknown>(
    namespace: string,
    owner: string,
  ): StoredDocument<T>[] {
    const rows = this.db
      .prepare(
        "SELECT id,revision,body FROM documents WHERE namespace=? AND owner=? ORDER BY id",
      )
      .all(idSchema.parse(namespace), addressSchema.parse(owner));
    return rows.map((row) => ({
      id: row.id as string,
      revision: row.revision as number,
      data: JSON.parse(row.body as string) as T,
    }));
  }
  putDocument<T>(
    namespace: string,
    id: string,
    owner: string,
    data: T,
    expectedRevision?: number,
  ): StoredDocument<T> {
    return this.transaction(() => {
      const previous = this.getDocument(namespace, id, owner);
      if (
        expectedRevision !== undefined &&
        (previous?.revision ?? 0) !== expectedRevision
      )
        throw new StoreError("CONFLICT", "Document revision changed.");
      const revision = (previous?.revision ?? 0) + 1;
      this.db
        .prepare(
          "INSERT INTO documents(namespace,id,owner,revision,body) VALUES(?,?,?,?,?) ON CONFLICT(namespace,id,owner) DO UPDATE SET revision=excluded.revision,body=excluded.body",
        )
        .run(
          namespace,
          id,
          addressSchema.parse(owner),
          revision,
          canonicalJson(data),
        );
      return { id, revision, data };
    });
  }
}
