import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** A second process must not mark a live runner's requests as interrupted. */
export function lockDatabase(path: string): () => void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const lock = `${path}.lock`;
  try { mkdirSync(lock, { mode: 0o700 }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const pid = Number(readFileSync(`${lock}/pid`, "utf8"));
    if (!Number.isSafeInteger(pid) || pid < 1) throw new Error("Invalid runner database lock");
    try { process.kill(pid, 0); }
    catch (probe) {
      if ((probe as NodeJS.ErrnoException).code !== "ESRCH") throw probe;
      rmSync(lock, { recursive: true });
      return lockDatabase(path);
    }
    throw new Error("Review database already has a live owner");
  }
  writeFileSync(`${lock}/pid`, String(process.pid), { mode: 0o600 });
  return () => rmSync(lock, { recursive: true, force: true });
}
