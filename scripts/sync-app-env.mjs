import { copyFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(repositoryRoot, ".env");
const destination = resolve(repositoryRoot, "apps/aqua-mux-app/.env");

try {
  await stat(source);
} catch {
  console.error(`Missing ${source}. Copy .env.example to .env and set the required values.`);
  process.exitCode = 1;
  process.exit();
}

await copyFile(source, destination);
console.log("Copied root .env to apps/aqua-mux-app/.env.");
