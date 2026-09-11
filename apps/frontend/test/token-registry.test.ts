import assert from "node:assert/strict";
import test from "node:test";
import {
  findRegistryToken,
  parseTokenRegistry,
  searchTokenRegistry,
  tokenRegistryChainId,
} from "../lib/token-registry";

const address = (suffix: string) => `0x${suffix.padStart(40, "0")}`;

test("registry parsing keeps address identity and rejects malformed records", () => {
  const parsed = parseTokenRegistry(4663, {
    first: {
      chainId: 4663,
      address: address("1"),
      symbol: "HOOD",
      name: "Robinhood Markets",
      decimals: 18,
      tags: ["RWA"],
      providers: ["1inch"],
    },
    second: {
      chainId: 4663,
      address: address("2"),
      symbol: "HOOD",
      name: "Another HOOD",
      decimals: 6,
      tags: ["RISK:unverified"],
      providers: ["1inch"],
    },
    duplicate: {
      chainId: 4663,
      address: address("1"),
      symbol: "OTHER",
      name: "Duplicate address",
      decimals: 18,
    },
    wrongChain: {
      chainId: 1,
      address: address("3"),
      symbol: "BAD",
      name: "Wrong chain",
      decimals: 18,
    },
    malformed: { address: "nope" },
  });

  assert.equal(parsed.tokens.length, 1);
  assert.equal(parsed.rejected, 4);
  assert.deepEqual(
    parsed.tokens.map((token) => token.address),
    [address("2")],
  );
  assert.equal(parsed.tokens[0].risk, "unverified");
  assert.equal(parsed.tokens[0].selectable, true);
});

test("conflicting duplicate addresses are quarantined in both input orders", () => {
  const safe = {
    address: address("c"),
    symbol: "SAFE",
    name: "Safe Token",
    decimals: 6,
  };
  const malicious = {
    ...safe,
    decimals: 18,
    tags: ["RISK:malicious"],
  };
  for (const entries of [
    [safe, malicious],
    [malicious, safe],
  ]) {
    const parsed = parseTokenRegistry(1, entries);
    assert.equal(parsed.tokens.length, 0);
    assert.equal(parsed.rejected, 2);
  }
});

test("identical duplicate identities merge the strongest risk", () => {
  const identity = {
    address: address("d"),
    symbol: "DUP",
    name: "Duplicate",
    decimals: 18,
  };
  const parsed = parseTokenRegistry(1, [
    { ...identity, tags: ["bluechip"] },
    { ...identity, tags: ["RISK:malicious"], providers: ["1inch"] },
  ]);
  assert.equal(parsed.tokens.length, 1);
  assert.equal(parsed.tokens[0].risk, "malicious");
  assert.equal(parsed.tokens[0].selectable, false);
  assert.equal(parsed.rejected, 1);
});

test("registry search prioritizes an exact address and preserves duplicate symbols", () => {
  const parsed = parseTokenRegistry(1, [
    {
      address: address("a"),
      symbol: "USDC",
      name: "USD Coin",
      decimals: 6,
      tags: ["bluechip", "stablecoin"],
    },
    {
      address: address("b"),
      symbol: "USDC",
      name: "Unverified USD Coin",
      decimals: 18,
      tags: ["RISK:suspicious"],
    },
  ]);

  const bySymbol = searchTokenRegistry(parsed.tokens, "usdc", 10);
  assert.equal(bySymbol.total, 2);
  assert.equal(bySymbol.items[0].address, address("a"));
  assert.equal(bySymbol.items[1].selectable, false);

  const byAddress = searchTokenRegistry(parsed.tokens, address("b"), 10);
  assert.equal(byAddress.total, 1);
  assert.equal(byAddress.items[0].address, address("b"));
  assert.equal(findRegistryToken(parsed.tokens, address("a")).decimals, 6);
});

test("registry input limits reject unsupported chains and bound results", () => {
  assert.throws(() => tokenRegistryChainId(8453), /Unsupported/);
  const parsed = parseTokenRegistry(
    56,
    Array.from({ length: 120 }, (_, index) => ({
      address: address((index + 1).toString(16)),
      symbol: `T${index}`,
      name: `Token ${index}`,
      decimals: 18,
    })),
  );
  assert.equal(searchTokenRegistry(parsed.tokens, "", 1_000).items.length, 100);
});
