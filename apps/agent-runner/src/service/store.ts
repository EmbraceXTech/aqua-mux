import { DatabaseSync } from "node:sqlite";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type StoredReview = {
  request_id: string;
  fingerprint: string;
  request: string;
  status: "running" | "succeeded" | "failed" | "cancelled";
  response: string | null;
  error_code: string | null;
  error_status: number | null;
};
export type ResourceIdentity = {
  id: string;
  imageId: string;
  owner: string;
  instanceId?: string;
};

/** One runner process owns a database. Unfinished inference is never replayed. */
export class ReviewStore {
  private db: DatabaseSync;

  constructor(path: string) {
    if (path !== ":memory:")
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    if (path !== ":memory:") chmodSync(path, 0o600);
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA synchronous=FULL;
      PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS reviews (
        request_id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL,
        request TEXT NOT NULL, status TEXT NOT NULL,
        response TEXT, error_code TEXT, error_status INTEGER,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        entitlement TEXT NOT NULL CHECK(entitlement = 'uncharged-development')
      );
      CREATE TABLE IF NOT EXISTS review_events (
        sequence INTEGER PRIMARY KEY, request_id TEXT NOT NULL,
        status TEXT NOT NULL, created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS review_resources (
        container_id TEXT PRIMARY KEY, request_id TEXT NOT NULL, identity TEXT
      );
      CREATE INDEX IF NOT EXISTS reviews_created_at ON reviews(created_at);
    `);
    if (
      !this.db
        .prepare("PRAGMA table_info(review_resources)")
        .all()
        .some((row) => row.name === "identity")
    )
      this.db.exec("ALTER TABLE review_resources ADD COLUMN identity TEXT");
    this.atomic(() => {
      this.db
        .prepare(
          `INSERT INTO review_events(request_id,status,created_at)
        SELECT request_id,'failed',? FROM reviews WHERE status='running'`,
        )
        .run(Date.now());
      this.db
        .prepare(
          `UPDATE reviews SET status='failed', error_code='runner_restarted',
        error_status=503, updated_at=? WHERE status='running'`,
        )
        .run(Date.now());
    });
  }

  get(id: string): StoredReview | undefined {
    return this.db
      .prepare("SELECT * FROM reviews WHERE request_id=?")
      .get(id) as StoredReview | undefined;
  }

  recordTool(requestId: string, name: string): void {
    this.event(requestId, `tool:${name}`);
  }

  countSince(time: number): number {
    return Number(
      this.db
        .prepare("SELECT COUNT(*) AS count FROM reviews WHERE created_at>=?")
        .get(time)!.count,
    );
  }

  insert(id: string, fingerprint: string, request: unknown): void {
    const now = Date.now();
    this.atomic(() => {
      this.db
        .prepare(
          `INSERT INTO reviews
        (request_id,fingerprint,request,status,created_at,updated_at,entitlement)
        VALUES (?,?,?,'running',?,?,'uncharged-development')`,
        )
        .run(id, fingerprint, JSON.stringify(request), now, now);
      this.event(id, "running");
    });
  }

  finish(
    id: string,
    status: StoredReview["status"],
    response: unknown,
    errorCode: string | null = null,
    errorStatus: number | null = null,
  ): void {
    this.atomic(() => {
      const changed = this.db
        .prepare(
          `UPDATE reviews SET status=?,response=?,error_code=?,error_status=?,updated_at=?
        WHERE request_id=? AND status='running'`,
        )
        .run(
          status,
          response === null ? null : JSON.stringify(response),
          errorCode,
          errorStatus,
          Date.now(),
          id,
        );
      if (changed.changes) this.event(id, status);
    });
  }

  private event(id: string, status: string): void {
    this.db
      .prepare(
        "INSERT INTO review_events(request_id,status,created_at) VALUES(?,?,?)",
      )
      .run(id, status, Date.now());
  }

  private atomic(operation: () => void): void {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      operation();
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  close(): void {
    this.db.close();
  }

  registerResource(identity: ResourceIdentity, requestId: string): void {
    this.db
      .prepare(
        `INSERT INTO review_resources(container_id,request_id,identity) VALUES(?,?,?)
         ON CONFLICT(container_id) DO UPDATE SET identity=excluded.identity`,
      )
      .run(identity.id, requestId, JSON.stringify(identity));
  }
  forgetResource(containerId: string): void {
    this.db
      .prepare("DELETE FROM review_resources WHERE container_id=?")
      .run(containerId);
  }
  resources(): string[] {
    return this.db
      .prepare("SELECT container_id FROM review_resources")
      .all()
      .map((row) => String(row.container_id));
  }
  resourceRequests(): string[] {
    return this.db
      .prepare("SELECT DISTINCT request_id FROM review_resources")
      .all()
      .map((row) => String(row.request_id));
  }
  resourceIdentity(id: string): ResourceIdentity | undefined {
    const row = this.db
      .prepare("SELECT identity FROM review_resources WHERE container_id=?")
      .get(id);
    return row?.identity ? JSON.parse(String(row.identity)) : undefined;
  }
}
