import { chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

/** A second process must not mark a live runner's requests as interrupted. */
export function lockDatabase(path: string): () => void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const lock = new DatabaseSync(`${path}.owner.sqlite`);
  chmodSync(`${path}.owner.sqlite`, 0o600);
  try {
    lock.exec(
      "PRAGMA busy_timeout=0; PRAGMA journal_mode=DELETE; BEGIN EXCLUSIVE;",
    );
  } catch {
    lock.close();
    throw new Error("Review database already has a live owner");
  }
  // The OS releases the SQLite lock even after SIGKILL. No stale-PID deletion race.
  let released = false;
  return () => {
    if (!released) {
      lock.close();
      released = true;
    }
  };
}
