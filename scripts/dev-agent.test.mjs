import test from "node:test";
import assert from "node:assert/strict";
import {
  chmod,
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import {
  frontendEnvironment,
  privateToken,
  runnerEnvironment,
  settings,
} from "./dev-agent-config.mjs";
import { availablePort, launch, stop } from "./dev-agent-process.mjs";

async function directory(t) {
  const path = await mkdtemp(join(tmpdir(), "dev-agent-test-"));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}

test("token is private, stable and never follows a symlink or permissive file", async (t) => {
  const path = join(await directory(t), "dev.env");
  const token = await privateToken(path);
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.equal(new Set(token).size, 16);
  assert.equal(await privateToken(path), token);
  assert.equal((await stat(path)).mode & 0o777, 0o600);
  await chmod(path, 0o644);
  await assert.rejects(privateToken(path), /unsafe_token_file/);
  await chmod(path, 0o600);
  await symlink(path, `${path}.link`);
  await assert.rejects(privateToken(`${path}.link`));
});

test("runner environment excludes signing, app settings and provider API overrides", () => {
  const config = settings(["up"]);
  const env = runnerEnvironment(config, "runner-token", {
    PATH: "/bin",
    HOME: "/home/test",
    PRIVATE_KEY: "signer-sentinel",
    DATABASE_URL: "database-sentinel",
    NODE_OPTIONS: "load-untrusted",
    OPENAI_API_KEY: "api-sentinel",
    AQUAMUX_DEV_WALLET: "true",
  });
  assert.equal(env.AQUAMUX_AGENT_RUNNER_TOKEN, "runner-token");
  for (const name of [
    "PRIVATE_KEY",
    "DATABASE_URL",
    "NODE_OPTIONS",
    "OPENAI_API_KEY",
    "AQUAMUX_DEV_WALLET",
  ])
    assert.equal(name in env, false);
  assert.equal(JSON.stringify(env).includes("sentinel"), false);
});

test("private frontend overrides stay frontend-only and runner token is never public", async (t) => {
  const path = join(await directory(t), "frontend.env");
  await writeFile(path, "PRIVATE_KEY=fixture-only\nAQUAMUX_DEV_WALLET=true\n", {
    mode: 0o600,
  });
  const config = settings(["frontend", "--frontend-env", path]);
  const env = await frontendEnvironment(config, "runner-token", {});
  assert.equal(env.PRIVATE_KEY, "fixture-only");
  assert.equal(env.AQUAMUX_AGENT_RUNNER_URL, "http://127.0.0.1:33128");
  assert.equal(
    Object.keys(env).some((k) => k.startsWith("NEXT_PUBLIC_")),
    false,
  );
  assert.equal(
    "PRIVATE_KEY" in runnerEnvironment(config, "runner-token", {}),
    false,
  );
  await writeFile(path, "NEXT_PUBLIC_AGENT_TOKEN=fixture-only\n");
  await assert.rejects(
    frontendEnvironment(config, "runner-token", {}),
    /server_only/,
  );
});

test("ports are explicit and an occupied listener is preserved", async (t) => {
  assert.throws(
    () => settings(["up", "--runner-port", "33127"]),
    /ports_must_differ/,
  );
  assert.throws(() => settings(["up", "--runner-port", "0"]), /invalid_port/);
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await assert.rejects(
    availablePort(server.address().port),
    /port_unavailable/,
  );
  assert.equal(server.listening, true);
});

test("owned child receives graceful termination and exits", async (t) => {
  const path = await directory(t);
  const marker = join(path, "started");
  const ended = join(path, "ended");
  const script = `const fs=require('fs');process.on('SIGTERM',()=>{fs.writeFileSync(process.argv[2],'stopped');process.exit(0)});fs.writeFileSync(process.argv[1],'started');setInterval(()=>{},1000)`;
  const child = launch("fixture", ["-e", script, marker, ended], path, {
    PATH: process.env.PATH,
  });
  t.after(() => stop([child]));
  for (let n = 0; n < 100; n++) {
    try {
      await readFile(marker);
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  assert.equal(await readFile(marker, "utf8"), "started");
  await stop([child]);
  assert.equal(await readFile(ended, "utf8"), "stopped");
  assert.equal(child.child.exitCode, 0);
});

for (const ignoresTerm of [false, true]) {
  test(`cleanup terminates surviving descendant, ignores SIGTERM=${ignoresTerm}`, async (t) => {
    const path = await directory(t);
    const marker = join(path, "descendant");
    const descendant = `${ignoresTerm ? 'process.on("SIGTERM",()=>{});' : ""}require('fs').writeFileSync(process.argv[1],String(process.pid));setInterval(()=>{},1000)`;
    const script = `const {spawn}=require('child_process');const child=spawn(process.execPath,['-e',${JSON.stringify(descendant)},process.argv[1]],{stdio:'ignore'});child.unref()`;
    const leader = launch("fixture", ["-e", script, marker], path, {
      PATH: process.env.PATH,
    });
    let pid;
    t.after(() => {
      if (pid)
        try {
          process.kill(pid, "SIGKILL");
        } catch {}
    });
    await leader.exited;
    for (let n = 0; n < 100; n++) {
      try {
        pid = Number(await readFile(marker, "utf8"));
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
    assert.ok(pid > 0);
    await stop([leader], { graceMs: 100, killMs: 1000 });
    assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
  });
}

test("local wallet requires explicit opt-in, fee cap and override key", async (t) => {
  assert.throws(
    () => settings(["up", "--dev-wallet"]),
    /private_env_and_fee_cap/,
  );
  assert.throws(
    () => settings(["up", "--dev-wallet-max-fee-wei", "1"]),
    /opt_in/,
  );
  const path = join(await directory(t), "wallet.env");
  await writeFile(path, `PRIVATE_KEY=${"1".repeat(64)}\n`, { mode: 0o600 });
  const config = settings([
    "frontend",
    "--frontend-env",
    path,
    "--dev-wallet",
    "--dev-wallet-max-fee-wei",
    "1000",
  ]);
  const enabled = await frontendEnvironment(config, "token", {});
  assert.equal(enabled.AQUAMUX_DEV_WALLET, "true");
  assert.equal(enabled.AQUAMUX_DEV_WALLET_MAX_FEE_WEI, "1000");
  assert.equal(
    "PRIVATE_KEY" in runnerEnvironment(config, "token", enabled),
    false,
  );
  assert.equal(
    "AQUAMUX_DEV_WALLET" in runnerEnvironment(config, "token", enabled),
    false,
  );
  const disabled = await frontendEnvironment(
    settings(["frontend"]),
    "token",
    enabled,
  );
  assert.equal(disabled.AQUAMUX_DEV_WALLET, "false");
  await writeFile(path, "ANOTHER_SETTING=value\n");
  await assert.rejects(
    frontendEnvironment(config, "token", enabled),
    /override_key/,
  );
});
