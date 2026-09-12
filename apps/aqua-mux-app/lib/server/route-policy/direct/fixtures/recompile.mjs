import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import solc from "solc";
const records = JSON.parse(
  readFileSync(new URL("./attestation.json", import.meta.url)),
);
for (const record of records) {
  const compilerFile = resolve(
    process.argv[2],
    `soljson-${record.compilerVersion.split("+")[0]}.cjs`,
  );
  assert.equal(
    createHash("sha256").update(readFileSync(compilerFile)).digest("hex"),
    record.compilerSha256,
  );
  const input = readFileSync(new URL(record.inputFile, import.meta.url));
  assert.equal(
    createHash("sha256").update(input).digest("hex"),
    record.inputSha256,
  );
  const compiler = solc.setupMethods(
    (await import(pathToFileURL(compilerFile).href)).default,
  );
  const output = JSON.parse(compiler.compile(input.toString()));
  assert.ok(!output.errors?.some((e) => e.severity === "error"));
  const contract = output.contracts[record.sourcePath][record.contract];
  const compiled = Buffer.from(contract.evm.deployedBytecode.object, "hex"),
    deployed = Buffer.from(record.code.slice(2), "hex");
  assert.equal(compiled.length, deployed.length);
  const names = new Map();
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (node.mutability === "immutable") names.set(String(node.id), node.name);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") visit(value);
    }
  };
  Object.values(output.sources).forEach(visit);
  for (const [id, refs] of Object.entries(
    contract.evm.deployedBytecode.immutableReferences ?? {},
  )) {
    const value = record.immutableValuesById[id];
    assert.ok(value);
    const name = names.get(id);
    assert.ok(name, "Unknown immutable source name");
    if (name === "__self")
      assert.equal(value.slice(-40), record.address.slice(2));
    if (name === "restrictionEndBlock") {
      assert.equal(BigInt(value), BigInt(record.restrictionEndBlock));
      assert.ok(BigInt(record.blockNumber) > BigInt(value));
    }
    if (name === "pairToken")
      assert.equal(
        value.slice(-40),
        "0bd7d308f8e1639fab988df18a8011f41eacad73",
      );
    for (const { start, length } of refs) {
      assert.equal(length, 32);
      assert.equal(
        `0x${deployed.subarray(start, start + length).toString("hex")}`,
        value,
      );
      Buffer.from(value.slice(2), "hex").copy(compiled, start);
    }
  }
  // The factory embeds pair creation code. Only the bzzr1 digest in each CBOR map differs.
  for (const offset of record.metadataHashOffsets) {
    assert.equal(
      compiled.subarray(offset - 8, offset).toString("hex"),
      "65627a7a72315820",
    );
    assert.equal(
      deployed.subarray(offset - 8, offset).toString("hex"),
      "65627a7a72315820",
    );
    deployed.copy(compiled, offset, offset, offset + 32);
  }
  const metadataLength = compiled.readUInt16BE(compiled.length - 2) + 2;
  assert.equal(metadataLength, deployed.readUInt16BE(deployed.length - 2) + 2);
  assert.deepEqual(
    compiled.subarray(0, -metadataLength),
    deployed.subarray(0, -metadataLength),
  );
  console.log(
    `${record.name}: executable runtime and immutable substitutions match`,
  );
}
