import { spawn } from "node:child_process";
import { createServer } from "node:net";

export async function availablePort(port) {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", () => reject(new Error("port_unavailable")));
    server.listen(port, "127.0.0.1", resolve);
  });
  await new Promise((resolve) => server.close(resolve));
}

export function launch(name, args, cwd, env) {
  const child = spawn(process.execPath, args, {
    cwd,
    env,
    detached: true,
    stdio: ["ignore", "ignore", "ignore"],
  });
  const exited = new Promise((resolve) => {
    child.once("error", () => resolve({ name, code: 1 }));
    child.once("exit", (code) => resolve({ name, code: code ?? 1 }));
  });
  return { name, child, exited };
}

function signalGroup(pid, signal) {
  if (!pid) return false;
  try {
    process.kill(-pid, signal);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") return false;
    throw error;
  }
}

async function groupsGone(processes, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  do {
    if (!processes.some(({ child }) => signalGroup(child.pid, 0))) return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  } while (Date.now() < deadline);
  return !processes.some(({ child }) => signalGroup(child.pid, 0));
}

export async function stop(processes, { graceMs = 45000, killMs = 5000 } = {}) {
  // The group can outlive its launcher, so exitCode cannot prove cleanup.
  for (const { child } of processes) signalGroup(child.pid, "SIGTERM");
  if (!(await groupsGone(processes, graceMs))) {
    for (const { child } of processes) signalGroup(child.pid, "SIGKILL");
    if (!(await groupsGone(processes, killMs)))
      throw new Error("cleanup_unconfirmed");
  }
  await Promise.all(processes.map((p) => p.exited));
}

export async function health(config, token, kind) {
  const base = `http://127.0.0.1:${kind === "runner" ? config.runnerPort : config.frontendPort}`;
  try {
    if (kind === "runner") {
      const response = await fetch(`${base}/_dev_health`, {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(1500),
      });
      const anonymous = await fetch(`${base}/_dev_health`, {
        signal: AbortSignal.timeout(1500),
      });
      return (
        response.status === 404 &&
        anonymous.status === 401 &&
        (await response.json()).error?.code === "not_found" &&
        (await anonymous.json()).error?.code === "unauthorized"
      );
    }
    return (
      await fetch(`${base}/api/managed/catalog`, {
        signal: AbortSignal.timeout(5000),
      })
    ).ok;
  } catch {
    return false;
  }
}

export async function ready(config, token, process, kind, signal) {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    signal?.throwIfAborted();
    if (process.child.exitCode !== null || process.child.signalCode !== null)
      throw new Error("child_exited_before_ready");
    if (await health(config, token, kind)) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("startup_timeout");
}
