import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname } from "node:path";

const migration1 = `
CREATE TABLE records(kind TEXT NOT NULL, id TEXT NOT NULL, owner TEXT NOT NULL, group_id TEXT, revision INTEGER NOT NULL, body TEXT NOT NULL CHECK(json_valid(body)), PRIMARY KEY(kind,id));
CREATE INDEX records_owner ON records(owner,kind,group_id);
CREATE UNIQUE INDEX one_group_per_wallet ON records(json_extract(body,'$.chainId'),json_extract(body,'$.maker')) WHERE kind='group' AND json_extract(body,'$.state') != 'closed';
CREATE TABLE events(sequence INTEGER PRIMARY KEY AUTOINCREMENT, owner TEXT NOT NULL, kind TEXT NOT NULL, record_id TEXT NOT NULL, revision INTEGER NOT NULL, created_at INTEGER NOT NULL, body TEXT NOT NULL);
CREATE TABLE idempotency(owner TEXT NOT NULL, scope TEXT NOT NULL, key TEXT NOT NULL, digest TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(owner,scope,key));
CREATE TABLE documents(namespace TEXT NOT NULL, id TEXT NOT NULL, owner TEXT NOT NULL, revision INTEGER NOT NULL, body TEXT NOT NULL CHECK(json_valid(body)), PRIMARY KEY(namespace,id,owner));
CREATE TABLE challenges(id TEXT PRIMARY KEY, owner TEXT NOT NULL, origin TEXT NOT NULL, message TEXT NOT NULL, expires_at INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0);
CREATE TABLE sessions(token_hash TEXT PRIMARY KEY, id TEXT UNIQUE NOT NULL, owner TEXT NOT NULL, origin TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE execution_locks(chain_id INTEGER NOT NULL, maker TEXT NOT NULL, owner TEXT NOT NULL, holder TEXT NOT NULL, fence INTEGER NOT NULL, expires_at INTEGER NOT NULL, unresolved INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(chain_id,maker));
`;

export class StoreDatabase {
  readonly db: DatabaseSync;
  private depth = 0;
  constructor(path: string) {
    if (path !== ":memory:")
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    if (path !== ":memory:") chmodSync(path, 0o600);
    this.db.exec(
      "PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;",
    );
    try {
      this.transaction(() => {
        const version = Number(
          (
            this.db.prepare("PRAGMA user_version").get() as {
              user_version: number;
            }
          ).user_version,
        );
        if (version > 1)
          throw new Error("Database schema is newer than this application.");
        if (version === 0) {
          this.db.exec(migration1);
          this.db.exec("PRAGMA user_version=1");
        }
      });
    } catch (error) {
      this.db.close();
      throw error;
    }
  }
  transaction<T>(fn: () => T): T {
    const savepoint = `managed_${this.depth}`;
    this.db.exec(
      this.depth === 0 ? "BEGIN IMMEDIATE" : `SAVEPOINT ${savepoint}`,
    );
    this.depth++;
    try {
      const result = fn();
      if (result && typeof (result as { then?: unknown }).then === "function")
        throw new Error("Store transactions must be synchronous.");
      this.db.exec(
        this.depth === 1 ? "COMMIT" : `RELEASE SAVEPOINT ${savepoint}`,
      );
      return result;
    } catch (error) {
      this.db.exec(
        this.depth === 1
          ? "ROLLBACK"
          : `ROLLBACK TO SAVEPOINT ${savepoint}; RELEASE SAVEPOINT ${savepoint}`,
      );
      throw error;
    } finally {
      this.depth--;
    }
  }
  close() {
    this.db.close();
  }
}
export class StoreError extends Error {
  constructor(
    public readonly code: "NOT_FOUND" | "CONFLICT" | "FORBIDDEN" | "LOCKED",
    message: string,
  ) {
    super(message);
    this.name = "StoreError";
  }
}
