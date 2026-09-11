import { createDockerSandbox } from "../docker-sandbox.mjs";
import { docker } from "../docker-command.mjs";
import type { ResourceIdentity, ReviewStore } from "./store";

type AcquireOptions = {
  abortSignal: AbortSignal;
  onAcquiring: (identity: ResourceIdentity) => void;
};
type Acquired = { id: string; identity: ResourceIdentity };

/** Ownership reaches SQLite before Docker can create the container. */
export async function acquireReviewSandbox<T extends Acquired>(
  requestId: string,
  signal: AbortSignal,
  store: ReviewStore,
  acquire: (options: AcquireOptions) => Promise<T>,
): Promise<T> {
  const sandbox = await acquire({
    abortSignal: signal,
    onAcquiring: (identity) => store.registerResource(identity, requestId),
  });
  store.registerResource(sandbox.identity, requestId);
  return sandbox;
}

export function createReviewSandbox(
  requestId: string,
  signal: AbortSignal,
  store: ReviewStore,
) {
  return acquireReviewSandbox(requestId, signal, store, createDockerSandbox);
}

/** Retire only database-owned container identities before accepting new work. */
export async function recoverResources(
  store: ReviewStore,
  execute: (args: string[]) => Promise<Buffer> = docker,
): Promise<void> {
  const ids = store.resources();
  if (!ids.length) return;
  const existing = new Set(
    (await execute(["ps", "-a", "--format", "{{.Names}}"]))
      .toString()
      .trim()
      .split("\n"),
  );
  for (const id of ids) {
    if (!/^aquamux-runtime-[a-f0-9-]+$/.test(id))
      throw new Error("Invalid persisted resource identifier");
    if (existing.has(id)) {
      const identity = store.resourceIdentity(id);
      const [actual] = JSON.parse((await execute(["inspect", id])).toString());
      if (
        !identity ||
        identity.id !== id ||
        actual.Name !== `/${id}` ||
        actual.Image !== identity.imageId ||
        actual.Config?.Labels?.["aquamux.runtime-owner"] !== identity.owner ||
        actual.Config?.Labels?.["aquamux.runtime-spike"] !== "true" ||
        (identity.instanceId && identity.instanceId !== actual.Id)
      )
        throw new Error("Persisted resource ownership mismatch");
      await execute(["rm", "-f", actual.Id]);
    }
    store.forgetResource(id);
  }
}
