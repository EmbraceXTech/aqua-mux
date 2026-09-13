import { spawn } from "node:child_process";
import { createServer } from "node:net";

const extraArgs = process.argv.slice(2);
const hasPortArgument = extraArgs.some(
  (arg) =>
    arg === "--port" ||
    arg === "-p" ||
    arg.startsWith("--port=") ||
    /^-p\d/.test(arg),
);

function findOpenPort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0 }, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not select a local development port."));
        return;
      }
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

const port =
  process.env.PORT ?? (hasPortArgument ? undefined : String(await findOpenPort()));
const nextArgs = ["dev", "--hostname", "127.0.0.1"];
if (port) nextArgs.push("--port", port);
nextArgs.push(...extraArgs);

if (port) console.log(`Starting AquaMux on http://127.0.0.1:${port}`);

const child = spawn("next", nextArgs, {
  env: { ...process.env, ...(port ? { PORT: port } : {}) },
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"])
  process.on(signal, () => child.kill(signal));

child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
