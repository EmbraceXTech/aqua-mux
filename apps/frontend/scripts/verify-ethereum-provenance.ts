import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { client } from "../lib/server/rpc";
import {
  encodeAbiParameters,
  keccak256,
  padHex,
  stringToHex,
  toHex,
  type Hex,
} from "viem";
import {
  poolDeployments,
  routerDeployments,
} from "../lib/server/route-policy/deployments";
import attestation from "../lib/server/route-policy/fixtures/ethereum/attestation.json";

function withoutMetadata(bytes: Buffer) {
  const length = bytes.readUInt16BE(bytes.length - 2) + 2;
  assert.ok(length < bytes.length);
  return bytes.subarray(0, -length);
}

const word = (value: string | number | bigint) =>
  typeof value === "string"
    ? padHex(value as Hex, { size: 32 })
    : toHex(value, { size: 32 });
const factories: Record<number, Hex> = {
  1: "0x1f98431c8ad98523631ae4a59f267346ea31f984",
  42161: "0x1f98431c8ad98523631ae4a59f267346ea31f984",
};

process.loadEnvFile(new URL("../.env", import.meta.url).pathname);
async function verify() {
  for (const build of Object.values(attestation.builds)) {
    const input = readFileSync(
      new URL(
        `../lib/server/route-policy/fixtures/ethereum/${build.inputFile}`,
        import.meta.url,
      ),
    );
    assert.equal(
      createHash("sha256").update(input).digest("hex"),
      build.inputSha256,
    );
  }
  for (const record of attestation.deployments) {
    const build =
      attestation.builds[record.build as keyof typeof attestation.builds];
    const compiled = Buffer.from(build.template.slice(2), "hex");
    const deployed = Buffer.from(record.code.slice(2), "hex");
    const router = routerDeployments[record.chainId];
    const pool = poolDeployments.find(
      (p) => p.address === record.address.toLowerCase(),
    );
    const nameHash = keccak256(stringToHex("1inch Aggregation Router"));
    const versionHash = keccak256(stringToHex("6"));
    const domain = keccak256(
      encodeAbiParameters(
        [
          { type: "bytes32" },
          { type: "bytes32" },
          { type: "bytes32" },
          { type: "uint256" },
          { type: "address" },
        ],
        [
          keccak256(
            stringToHex(
              "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)",
            ),
          ),
          nameHash,
          versionHash,
          BigInt(record.chainId),
          router.address,
        ],
      ),
    );
    const expected: Record<string, Hex> = {
      _cachedDomainSeparator: domain,
      _cachedChainId: word(record.chainId),
      _cachedThis: word(router.address),
      _hashedName: nameHash,
      _hashedVersion: versionHash,
      _name:
        "0x31696e6368204167677265676174696f6e20526f757465720000000000000018",
      _version:
        "0x3600000000000000000000000000000000000000000000000000000000000001",
      _WETH: word(router.wrapped),
      WETH9: word(router.wrapped),
      factory: word(factories[record.chainId]),
      ...(pool
        ? {
            original: word(pool.address),
            token0: word(pool.token0),
            token1: word(pool.token1),
            fee: word(pool.fee),
            tickSpacing: word(10),
            maxLiquidityPerTick: word(((1n << 128n) - 1n) / 177455n),
          }
        : {}),
    };
    for (const [name, refs] of Object.entries(build.immutables)) {
      const value = expected[name];
      assert.ok(value, `Unknown immutable ${name}`);
      assert.equal(
        (record.immutableValues as Record<string, string>)[name],
        value,
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
    assert.deepEqual(withoutMetadata(compiled), withoutMetadata(deployed));
    if (record.metadataMatch) assert.deepEqual(compiled, deployed);
    const expectedHash =
      pool?.codeHash ??
      (record.role === "router"
        ? router.codeHash
        : record.role === "quoter"
          ? router.quoterCodeHash
          : record.role === "wrappedImplementation"
            ? router.wrappedImplementation?.codeHash
            : router.wrappedCodeHash);
    assert.equal(keccak256(record.code as Hex), expectedHash);
    assert.equal(record.codeHash, expectedHash);
    const rpc = client(record.chainId);
    assert.equal(await rpc.getChainId(), record.chainId);
    const live = await rpc.getCode({ address: record.address as Hex });
    assert.ok(live);
    assert.equal(keccak256(live), expectedHash);
    console.log(
      `${record.role}: source semantics and current runtime verified`,
    );
  }
}
verify().catch(() => {
  console.error("Ethereum source/runtime verification failed.");
  process.exitCode = 1;
});
