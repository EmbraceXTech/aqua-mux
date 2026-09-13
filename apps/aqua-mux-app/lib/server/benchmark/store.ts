import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  sources,
  type BenchmarkData,
  type Coverage,
  type MarketPool,
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
      CREATE TABLE IF NOT EXISTS benchmark_pools(id TEXT PRIMARY KEY, source_id TEXT NOT NULL, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS benchmark_attempts(id TEXT PRIMARY KEY, updated_at INTEGER NOT NULL, reason TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS benchmark_scans(id TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS benchmark_lock(id INTEGER PRIMARY KEY CHECK(id=1), expires_at INTEGER NOT NULL, holder TEXT, pid INTEGER);
    `);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const columns = this.db
        .prepare("PRAGMA table_info(benchmark_lock)")
        .all() as { name: string }[];
      if (!columns.some((column) => column.name === "holder"))
        this.db.exec("ALTER TABLE benchmark_lock ADD COLUMN holder TEXT");
      if (!columns.some((column) => column.name === "pid"))
        this.db.exec("ALTER TABLE benchmark_lock ADD COLUMN pid INTEGER");
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      this.db.close();
      throw error;
    }
  }
  private processIsAlive(pid: number | null) {
    if (pid === null || !Number.isSafeInteger(pid) || pid < 1) return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      // A process we cannot signal may belong to another user. Do not steal its lease.
      return !(
        error instanceof Error &&
        "code" in error &&
        error.code === "ESRCH"
      );
    }
  }
  lock() {
    const now = Date.now();
    const expiresAt = now + 30 * 60_000;
    const acquired =
      this.db
        .prepare(
          "INSERT INTO benchmark_lock(id,expires_at,holder,pid) VALUES(1,?,?,?) ON CONFLICT(id) DO UPDATE SET expires_at=excluded.expires_at,holder=excluded.holder,pid=excluded.pid WHERE benchmark_lock.expires_at < ?",
        )
        .run(expiresAt, this.holder, process.pid, now).changes > 0;
    if (acquired) return true;
    const current = this.db
      .prepare("SELECT holder,pid FROM benchmark_lock WHERE id=1")
      .get() as { holder: string | null; pid: number | null } | undefined;
    if (!current || this.processIsAlive(current.pid)) return false;
    // SQLite is local-only in this application. A live lease without a live local PID
    // can only have been left by an interrupted worker, so reclaim it atomically.
    return (
      this.db
        .prepare(
          "UPDATE benchmark_lock SET expires_at=?,holder=?,pid=? WHERE id=1 AND holder IS ? AND pid IS ?",
        )
        .run(expiresAt, this.holder, process.pid, current.holder, current.pid)
        .changes > 0
    );
  }
  renew() {
    return (
      this.db
        .prepare(
          "UPDATE benchmark_lock SET expires_at=? WHERE id=1 AND holder=? AND pid=? AND expires_at>?",
        )
        .run(Date.now() + 30 * 60_000, this.holder, process.pid, Date.now())
        .changes > 0
    );
  }
  unlock() {
    this.db
      .prepare("DELETE FROM benchmark_lock WHERE holder=? AND pid=?")
      .run(this.holder, process.pid);
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
  replacePools(sourceId: string, pools: MarketPool[]) {
    this.db
      .prepare("DELETE FROM benchmark_pools WHERE source_id=?")
      .run(sourceId);
    const insert = this.db.prepare("INSERT INTO benchmark_pools VALUES(?,?,?)");
    for (const pool of pools)
      insert.run(pool.id, sourceId, JSON.stringify(pool));
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
    const pools = (
      this.db.prepare("SELECT body FROM benchmark_pools").all() as {
        body: string;
      }[]
    ).map((row) => JSON.parse(row.body) as MarketPool);
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
      pools,
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
