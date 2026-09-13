import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  sources,
  type BenchmarkData,
  type Coverage,
  type VerifiedPosition,
} from "../../benchmark/model";

export class BenchmarkStore {
  readonly db: DatabaseSync;
  private readonly holder = randomUUID();
  constructor(
    path = resolve(
      process.env.AQUAMUX_BENCHMARK_DB_PATH ?? ".data/benchmark.sqlite",
    ),
  ) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS benchmark_sources(id TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS benchmark_positions(id TEXT PRIMARY KEY, source_id TEXT NOT NULL, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS benchmark_attempts(id TEXT PRIMARY KEY, updated_at INTEGER NOT NULL, reason TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS benchmark_scans(id TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS benchmark_lock(id INTEGER PRIMARY KEY CHECK(id=1), expires_at INTEGER NOT NULL, holder TEXT);
    `);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const columns = this.db
        .prepare("PRAGMA table_info(benchmark_lock)")
        .all() as { name: string }[];
      if (!columns.some((column) => column.name === "holder"))
        this.db.exec("ALTER TABLE benchmark_lock ADD COLUMN holder TEXT");
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      this.db.close();
      throw error;
    }
  }
  lock() {
    const now = Date.now();
    return (
      this.db
        .prepare(
          "INSERT INTO benchmark_lock(id,expires_at,holder) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET expires_at=excluded.expires_at,holder=excluded.holder WHERE benchmark_lock.expires_at < ?",
        )
        .run(now + 30 * 60_000, this.holder, now).changes > 0
    );
  }
  renew() {
    return (
      this.db
        .prepare(
          "UPDATE benchmark_lock SET expires_at=? WHERE id=1 AND holder=? AND expires_at>?",
        )
        .run(Date.now() + 30 * 60_000, this.holder, Date.now()).changes > 0
    );
  }
  unlock() {
    this.db
      .prepare("DELETE FROM benchmark_lock WHERE holder=?")
      .run(this.holder);
  }
  coverage(row: Coverage) {
    this.db
      .prepare("INSERT OR REPLACE INTO benchmark_sources VALUES(?,?)")
      .run(row.id, JSON.stringify(row));
  }
  position(row: VerifiedPosition) {
    this.db
      .prepare("INSERT OR REPLACE INTO benchmark_positions VALUES(?,?,?)")
      .run(row.id, row.sourceId, JSON.stringify(row));
  }
  scan(
    id: string,
  ): { block: number; since: number; skip: number; days: number } | undefined {
    const row = this.db
      .prepare("SELECT body FROM benchmark_scans WHERE id=?")
      .get(id) as { body: string } | undefined;
    return row ? JSON.parse(row.body) : undefined;
  }
  saveScan(
    id: string,
    scan: { block: number; since: number; skip: number; days: number },
  ) {
    this.db
      .prepare("INSERT OR REPLACE INTO benchmark_scans VALUES(?,?)")
      .run(id, JSON.stringify(scan));
  }
  resetScan(id: string) {
    this.db.prepare("DELETE FROM benchmark_scans WHERE id=?").run(id);
  }
  attempted(id: string) {
    return Boolean(
      this.db.prepare("SELECT 1 FROM benchmark_positions WHERE id=?").get(id),
    );
  }
  attempt(id: string, reason: string) {
    this.db
      .prepare("INSERT OR REPLACE INTO benchmark_attempts VALUES(?,?,?)")
      .run(id, Date.now(), reason);
  }
  read(): BenchmarkData {
    const coverage = new Map(
      (
        this.db.prepare("SELECT body FROM benchmark_sources").all() as {
          body: string;
        }[]
      ).map((row) => {
        const value = JSON.parse(row.body) as Coverage;
        return [value.id, value];
      }),
    );
    const positions = (
      this.db.prepare("SELECT body FROM benchmark_positions").all() as {
        body: string;
      }[]
    ).map((row) => JSON.parse(row.body) as VerifiedPosition);
    return {
      coverage: sources.map(
        (source) =>
          coverage.get(source.id) ?? {
            ...source,
            status: "unavailable",
            checkedAt: 0,
            walletStatus: "Not indexed yet",
            candidates: 0,
            verified: 0,
            rejected: 0,
          },
      ),
      positions,
      updatedAt:
        Math.max(0, ...[...coverage.values()].map((row) => row.checkedAt)) ||
        null,
    };
  }
  close() {
    this.db.close();
  }
}
