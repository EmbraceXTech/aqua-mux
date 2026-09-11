import { spawn } from "node:child_process";
import { cp, mkdtemp, rm, symlink } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const source = dirname(dirname(fileURLToPath(import.meta.url)));
const port = Number(process.env.AQUAMUX_DEV_PORT ?? 33128);
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error("AQUAMUX_DEV_PORT must be an integer from 1024 to 65535.");
}

// Refuse occupied ports before copying. Next also checks at bind time.
await new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once("error", reject);
  probe.listen(port, "127.0.0.1", () => probe.close(resolve));
});

const directory = await mkdtemp(join(tmpdir(), "aquamux-baseline-"));
let child;
let stopping = false;
const stop = () => {
  stopping = true;
  child?.kill("SIGTERM");
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
try {
  // Copy the current source overlay, excluding credentials and runtime output.
  // A separate checkout prevents Next from rewriting the live tsconfig/types.
  await cp(source, directory, {
    recursive: true,
    filter: (path) => {
      const name = path.slice(source.length + 1).split("/")[0];
      return (
        path === source ||
        [
          "app",
          "components",
          "lib",
          "public",
          "package.json",
          "package-lock.json",
          "next.config.ts",
          "postcss.config.mjs",
          "tsconfig.json",
          "next-env.d.ts",
        ].includes(name)
      );
    },
  });
  await symlink(join(source, "node_modules"), join(directory, "node_modules"));
  if (!stopping) {
    console.log(`Baseline source copy: ${directory}`);
    child = spawn(
      process.execPath,
      [
        join(source, "node_modules/next/dist/bin/next"),
        "dev",
        "--webpack",
        "--hostname",
        "127.0.0.1",
        "--port",
        String(port),
      ],
      { cwd: directory, env: process.env, stdio: "inherit" },
    );
    process.exitCode = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code) => resolve(stopping ? 0 : (code ?? 1)));
    });
  }
} finally {
  await rm(directory, { recursive: true, force: true });
  process.off("SIGINT", stop);
  process.off("SIGTERM", stop);
}
