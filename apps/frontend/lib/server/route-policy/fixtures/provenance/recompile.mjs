// Optional source reproduction. Usage: node recompile.mjs /absolute/compiler/cache
// The cache holds soljson-<version>.cjs downloaded from each attested official URL.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import solc from "solc";
const { builds } = JSON.parse(
  readFileSync(new URL("./attestation.json", import.meta.url)),
);
const cache = process.argv[2];
assert.ok(cache, "Supply the compiler cache directory.");
for (const [name, build] of Object.entries(builds)) {
  const input = readFileSync(new URL(build.inputFile, import.meta.url));
  assert.equal(
    createHash("sha256").update(input).digest("hex"),
    build.inputSha256,
  );
  const compilerPath = resolve(
    cache,
    `soljson-${build.compilerVersion.split("+")[0]}.cjs`,
  );
  const compilerBytes = readFileSync(compilerPath);
  assert.equal(
    createHash("sha256").update(compilerBytes).digest("hex"),
    build.compilerSha256,
  );
  const compiler = solc.setupMethods(
    (await import(pathToFileURL(compilerPath).href)).default,
  );
  assert.ok(compiler.version().startsWith(build.compilerVersion));
  const result = JSON.parse(
    compiler.compile(
      JSON.stringify({
        ...JSON.parse(input),
        settings: {
          ...JSON.parse(input).settings,
          outputSelection: {
            "*": { "*": ["evm.deployedBytecode"], "": ["ast"] },
          },
        },
      }),
    ),
  );
  assert.ok(
    !result.errors?.some((error) => error.severity === "error"),
    "Compilation failed.",
  );
  const contract = result.contracts[build.sourcePath][build.contract];
  assert.equal(`0x${contract.evm.deployedBytecode.object}`, build.template);
  const names = new Map();
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (node.mutability === "immutable") names.set(String(node.id), node.name);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") visit(value);
    }
  };
  Object.values(result.sources).forEach(visit);
  const namedReferences = Object.fromEntries(
    Object.entries(contract.evm.deployedBytecode.immutableReferences ?? {}).map(
      ([id, refs]) => {
        assert.ok(names.has(id), "Unknown compiler immutable ID.");
        return [names.get(id), refs];
      },
    ),
  );
  assert.deepEqual(namedReferences, build.immutables);
  console.log(
    `${name}: compiler and source reproduce retained runtime template`,
  );
}
