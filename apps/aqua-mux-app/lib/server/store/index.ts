import { resolve } from "node:path";
import { ManagedStore } from "./export";
export { ManagedStore, redactExport } from "./export";
export { StoreError } from "./database";
export type { StoredDocument } from "./documents";
export type { ExecutionLock } from "./locks";
export type { PutOptions } from "./record-store";

const globalStore = globalThis as typeof globalThis & {
  aquamuxManagedStore?: ManagedStore;
};
/** Local authoritative database. Hosted deployments must provide a persistent service. */
export function openManagedStore(): ManagedStore {
  if (!globalStore.aquamuxManagedStore)
    globalStore.aquamuxManagedStore = new ManagedStore(
      resolve(process.env.AQUAMUX_DB_PATH ?? ".data/managed.sqlite"),
    );
  return globalStore.aquamuxManagedStore;
}
