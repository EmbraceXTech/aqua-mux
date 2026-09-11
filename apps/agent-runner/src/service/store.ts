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

/** One runner process owns a database. Unfinished inference is never replayed. */
export class ReviewStore {
  private db: DatabaseSync;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
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
        container_id TEXT PRIMARY KEY, request_id TEXT NOT NULL
      );
    `);
    this.db.prepare(`UPDATE reviews SET status='failed', error_code='runner_restarted',
      error_status=503, updated_at=? WHERE status='running'`).run(Date.now());
  }

  get(id: string): StoredReview | undefined {
    return this.db.prepare("SELECT * FROM reviews WHERE request_id=?").get(id) as StoredReview | undefined;
  }

  countSince(time: number): number {
    return Number(this.db.prepare("SELECT COUNT(*) AS count FROM reviews WHERE created_at>=?").get(time)!.count);
  }

  insert(id: string, fingerprint: string, request: unknown): void {
    const now = Date.now();
    this.db.prepare(`INSERT INTO reviews
      (request_id,fingerprint,request,status,created_at,updated_at,entitlement)
      VALUES (?,?,?,'running',?,?,'uncharged-development')`).run(id, fingerprint, JSON.stringify(request), now, now);
    this.event(id, "running");
  }

  finish(id: string, status: StoredReview["status"], response: unknown, errorCode: string | null = null, errorStatus: number | null = null): void {
    this.db.prepare(`UPDATE reviews SET status=?,response=?,error_code=?,error_status=?,updated_at=?
      WHERE request_id=? AND status='running'`).run(status, response === null ? null : JSON.stringify(response), errorCode, errorStatus, Date.now(), id);
    this.event(id, status);
  }

  private event(id: string, status: string): void {
    this.db.prepare("INSERT INTO review_events(request_id,status,created_at) VALUES(?,?,?)").run(id, status, Date.now());
  }

  close(): void { this.db.close(); }

  registerResource(containerId: string, requestId: string): void {
    this.db.prepare("INSERT INTO review_resources(container_id,request_id) VALUES(?,?)").run(containerId, requestId);
  }
  forgetResource(containerId: string): void {
    this.db.prepare("DELETE FROM review_resources WHERE container_id=?").run(containerId);
  }
  resources(): string[] {
    return this.db.prepare("SELECT container_id FROM review_resources").all().map(row => String(row.container_id));
  }
}
