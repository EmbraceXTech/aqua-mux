import { resolve } from "node:path";
import {
  frontendEnvironment,
  privateToken,
  root,
  runnerEnvironment,
  settings,
  tokenPath,
} from "./dev-agent-config.mjs";
import {
  availablePort,
  health,
  launch,
  ready,
  stop,
} from "./dev-agent-process.mjs";

process.umask(0o077);
const emit = (event) => console.log(JSON.stringify(event));
const processes = [];
let stopping;
const controller = new AbortController();
const shutdown = () => (stopping ??= stop(processes));
const interrupt = () => {
  controller.abort();
  void shutdown().catch(() => {
    process.exitCode = 1;
  });
};
process.once("SIGINT", interrupt);
process.once("SIGTERM", interrupt);

async function main() {
  const config = settings(process.argv.slice(2));
  const token = await privateToken(tokenPath, config.command !== "status");
  if (config.command === "init") {
    emit({ event: "dev_agent_initialized", tokenFile: tokenPath });
    return;
  }
  if (config.command === "status") {
    emit({
      event: "dev_agent_status",
      runnerPort: config.runnerPort,
      frontendPort: config.frontendPort,
      runnerAuthenticated: await health(config, token, "runner"),
      frontendReady: await health(config, token, "frontend"),
    });
    return;
  }
  const runRunner = ["runner", "up"].includes(config.command);
  const runFrontend = ["frontend", "up"].includes(config.command);
  if (runRunner) await availablePort(config.runnerPort);
  if (runFrontend) await availablePort(config.frontendPort);
  controller.signal.throwIfAborted();
  if (runRunner) {
    const runner = launch(
      "runner",
      ["--import", "tsx", "src/service/main.ts"],
      resolve(root, "apps/agent-runner"),
      runnerEnvironment(config, token),
    );
    processes.push(runner);
    await ready(config, token, runner, "runner", controller.signal);
    emit({
      event: "dev_agent_ready",
      service: "runner",
      url: `http://127.0.0.1:${config.runnerPort}`,
      provider: config.provider,
    });
  }
  if (runFrontend) {
    if (!(await health(config, token, "runner")))
      throw new Error("authenticated_runner_unavailable");
    const env = await frontendEnvironment(config, token);
    controller.signal.throwIfAborted();
    const frontend = launch(
      "frontend",
      [
        "node_modules/next/dist/bin/next",
        "dev",
        "--webpack",
        "--hostname",
        "127.0.0.1",
        "--port",
        String(config.frontendPort),
      ],
      resolve(root, "apps/frontend"),
      env,
    );
    processes.push(frontend);
    await ready(config, token, frontend, "frontend", controller.signal);
    emit({
      event: "dev_agent_ready",
      service: "frontend",
      url: `http://127.0.0.1:${config.frontendPort}`,
    });
  }
  const outcome = await Promise.race(processes.map((p) => p.exited));
  if (!stopping) {
    emit({ event: "dev_agent_child_exited", ...outcome });
    process.exitCode = outcome.code || 1;
  }
  await shutdown();
}

void main().catch(async (error) => {
  // Do not print arbitrary subprocess, environment-file or provider diagnostics.
  const known = new Set([
    "unknown_command",
    "missing_option_value",
    "invalid_port",
    "invalid_option",
    "ports_must_differ",
    "unsafe_private_directory",
    "unsafe_token_file",
    "invalid_token_file",
    "unsafe_frontend_env",
    "frontend_env_must_be_server_only",
    "port_unavailable",
    "child_exited_before_ready",
    "startup_timeout",
    "authenticated_runner_unavailable",
    "cleanup_unconfirmed",
    "dev_wallet_requires_private_env_and_fee_cap",
    "dev_wallet_opt_in_required",
    "dev_wallet_requires_override_key",
  ]);
  if (!controller.signal.aborted) {
    emit({
      event: "dev_agent_failed",
      reason: known.has(error?.message) ? error.message : "setup_failed",
    });
    process.exitCode = 1;
  }
  try {
    await shutdown();
  } catch {
    emit({ event: "dev_agent_failed", reason: "cleanup_unconfirmed" });
    process.exitCode = 1;
  }
});
