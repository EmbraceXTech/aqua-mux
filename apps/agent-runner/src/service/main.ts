import { resolve } from "node:path";
import { createReviewServer, validateServerToken } from "./http";
import { ReviewStore } from "./store";
import { Reviews } from "./reviews";
import { createProvider } from "./provider";
import { recoverResources } from "./resources";
import {
  assertSubscriptionEnvironment,
  isolateHostEnvironment,
} from "../runtime.mjs";
import { lockDatabase } from "./database-lock";
import { closeDiagnostics } from "./diagnostics";

process.umask(0o077);
const emit = closeDiagnostics();
async function start() {
  const token = process.env.AQUAMUX_AGENT_RUNNER_TOKEN ?? "";
  validateServerToken(token);
  const host = process.env.AQUAMUX_AGENT_RUNNER_HOST ?? "127.0.0.1";
  if (!["127.0.0.1", "::1"].includes(host))
    throw new Error("ReviewService requires a loopback bind address");
  const port = Number(process.env.AQUAMUX_AGENT_RUNNER_PORT ?? "4319");
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Invalid runner port");
  const provider = process.env.AQUAMUX_AGENT_RUNNER_PROVIDER ?? "codex";
  if (provider !== "codex" && provider !== "claude")
    throw new Error("Invalid runner provider");
  const database = resolve(
    process.env.AQUAMUX_AGENT_RUNNER_DATABASE ??
      new URL("../../.runtime/reviews.sqlite", import.meta.url).pathname,
  );
  assertSubscriptionEnvironment();
  isolateHostEnvironment();
  const unlock = lockDatabase(database);
  process.on("exit", unlock);
  const store = new ReviewStore(database);
  await recoverResources(store);
  const reviews = new Reviews(store, createProvider(provider, store));
  const server = createReviewServer(reviews, token);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  emit({
    event: "review_service_listening",
    host,
    port,
    provider,
    entitlement: "uncharged-development",
  });
  let stopping = false;
  async function shutdown() {
    if (stopping) return;
    stopping = true;
    server.close();
    await reviews.close();
    server.closeAllConnections();
  }
  process.on("SIGTERM", () => {
    void shutdown();
  });
  process.on("SIGINT", () => {
    void shutdown();
  });
}
void start().catch(() => {
  emit({ event: "review_service_start_failed" });
  process.exitCode = 1;
});
