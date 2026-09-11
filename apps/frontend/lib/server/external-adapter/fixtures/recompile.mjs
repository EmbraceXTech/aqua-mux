import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import solc from "solc";
const evidence = JSON.parse(
  readFileSync(new URL("./account-source.json", import.meta.url)),
);
const compilerFile = resolve(process.argv[2]);
assert.equal(
  createHash("sha256").update(readFileSync(compilerFile)).digest("hex"),
  evidence.compilerSha256,
);
const compiler = solc.setupMethods(
  (await import(pathToFileURL(compilerFile).href)).default,
);
assert.ok(
  compiler.version().startsWith(evidence.compilerVersion.replace(/^v/, "")),
);
const output = JSON.parse(compiler.compile(JSON.stringify(evidence.input)));
assert.ok(!output.errors?.some((error) => error.severity === "error"));
const runtime =
  output.contracts[evidence.sourcePath][evidence.contract].evm.deployedBytecode
    .object;
assert.equal(`0x${runtime}`, evidence.runtime);
console.log(
  "Simple7702Account exact deployed runtime reproduced from pinned compiler and source",
);
