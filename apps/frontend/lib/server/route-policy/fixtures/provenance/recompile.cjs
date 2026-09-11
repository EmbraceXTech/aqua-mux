// Optional source reproduction. Usage: node recompile.cjs /absolute/compiler/cache
// The cache holds soljson-<version>.cjs downloaded from each attested official URL.
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { resolve, join } = require("node:path");
const solc = require("solc");
const { builds } = require("./attestation.json");
const cache = process.argv[2];
assert.ok(cache, "Supply the compiler cache directory.");
for (const [name, build] of Object.entries(builds)) {
  const input = readFileSync(join(__dirname, build.inputFile));
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
  const compiler = solc.setupMethods(require(compilerPath));
  assert.ok(compiler.version().startsWith(build.compilerVersion));
  const result = JSON.parse(compiler.compile(input.toString()));
  assert.ok(
    !result.errors?.some((error) => error.severity === "error"),
    "Compilation failed.",
  );
  const contract = result.contracts[build.sourcePath][build.contract];
  assert.equal(`0x${contract.evm.deployedBytecode.object}`, build.template);
  console.log(
    `${name}: compiler and source reproduce retained runtime template`,
  );
}
