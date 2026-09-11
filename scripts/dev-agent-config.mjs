import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { chmod, lstat, mkdir, open, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

export const root = fileURLToPath(new URL("../", import.meta.url));
export const runtimeDirectory = resolve(root, "apps/agent-runner/.runtime");
export const tokenPath = resolve(runtimeDirectory, "dev-agent.env");

export function settings(args) {
  const command = args.shift() ?? "up";
  if (!["init", "runner", "frontend", "up", "status"].includes(command))
    throw new Error("unknown_command");
  const values = {
    command,
    runnerPort: 33128,
    frontendPort: 33127,
    provider: "codex",
    frontendEnv: undefined,
  };
  while (args.length) {
    const key = args.shift(),
      value = args.shift();
    if (!value) throw new Error("missing_option_value");
    if (key === "--runner-port" || key === "--frontend-port") {
      const port = Number(value);
      if (!Number.isInteger(port) || port < 1024 || port > 65535)
        throw new Error("invalid_port");
      values[key === "--runner-port" ? "runnerPort" : "frontendPort"] = port;
    } else if (key === "--provider" && ["codex", "claude"].includes(value))
      values.provider = value;
    else if (key === "--frontend-env") values.frontendEnv = resolve(value);
    else throw new Error("invalid_option");
  }
  if (values.runnerPort === values.frontendPort)
    throw new Error("ports_must_differ");
  return values;
}

export async function privateToken(path = tokenPath, create = true) {
  const directory = resolve(path, "..");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const info = await lstat(directory);
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    info.uid !== process.getuid()
  )
    throw new Error("unsafe_private_directory");
  await chmod(directory, 0o700);
  if (create) {
    try {
      const file = await open(
        path,
        constants.O_WRONLY |
          constants.O_CREAT |
          constants.O_EXCL |
          constants.O_NOFOLLOW,
        0o600,
      );
      try {
        let token;
        do {
          token = randomBytes(32).toString("hex");
        } while (new Set(token).size < 16);
        await file.writeFile(`AQUAMUX_AGENT_RUNNER_TOKEN=${token}\n`);
        await file.sync();
      } finally {
        await file.close();
      }
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
  }
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (
      !stat.isFile() ||
      stat.uid !== process.getuid() ||
      (stat.mode & 0o777) !== 0o600 ||
      stat.size > 1024
    )
      throw new Error("unsafe_token_file");
    const env = parseEnv(await file.readFile("utf8"));
    if (
      Object.keys(env).join() !== "AQUAMUX_AGENT_RUNNER_TOKEN" ||
      !/^[a-f0-9]{64}$/.test(env.AQUAMUX_AGENT_RUNNER_TOKEN) ||
      new Set(env.AQUAMUX_AGENT_RUNNER_TOKEN).size < 16
    )
      throw new Error("invalid_token_file");
    return env.AQUAMUX_AGENT_RUNNER_TOKEN;
  } finally {
    await file.close();
  }
}

export function runnerEnvironment(config, token, inherited = process.env) {
  const env = Object.fromEntries(
    [
      "PATH",
      "HOME",
      "USER",
      "CODEX_HOME",
      "DOCKER_HOST",
      "DOCKER_CONTEXT",
      "TMPDIR",
    ]
      .filter((k) => inherited[k])
      .map((k) => [k, inherited[k]]),
  );
  return {
    ...env,
    AQUAMUX_AGENT_RUNNER_TOKEN: token,
    AQUAMUX_AGENT_RUNNER_PORT: String(config.runnerPort),
    AQUAMUX_AGENT_RUNNER_PROVIDER: config.provider,
    AQUAMUX_AGENT_RUNNER_DATABASE: resolve(
      runtimeDirectory,
      `dev-reviews-${config.runnerPort}.sqlite`,
    ),
  };
}

export async function frontendEnvironment(
  config,
  token,
  inherited = process.env,
) {
  let overrides = {};
  if (config.frontendEnv) {
    const stat = await lstat(config.frontendEnv);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.uid !== process.getuid() ||
      (stat.mode & 0o777) !== 0o600 ||
      stat.size > 64 * 1024
    )
      throw new Error("unsafe_frontend_env");
    overrides = parseEnv(await readFile(config.frontendEnv, "utf8"));
    if (Object.keys(overrides).some((k) => k.startsWith("NEXT_PUBLIC_")))
      throw new Error("frontend_env_must_be_server_only");
  }
  const origin = `http://127.0.0.1:${config.frontendPort}`;
  return {
    ...inherited,
    ...overrides,
    NODE_ENV: "development",
    AQUAMUX_AUTH_ORIGIN: origin,
    AQUAMUX_DEV_WALLET_ORIGIN: origin,
    AQUAMUX_AGENT_RUNNER_URL: `http://127.0.0.1:${config.runnerPort}`,
    AQUAMUX_AGENT_RUNNER_TOKEN: token,
  };
}
