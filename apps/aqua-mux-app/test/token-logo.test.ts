import assert from "node:assert/strict";
import { test } from "node:test";
import { tokens } from "../lib/config";
import { logoForTokenSymbol } from "../lib/token-logo";

test("uses a logo from another supported chain when the current token has none", () => {
  const robinhoodWeth = tokens(4663).find((token) => token.symbol === "WETH");
  const arbitrumWeth = tokens(42161).find((token) => token.symbol === "WETH");

  assert.equal(robinhoodWeth?.logo, "");
  assert.ok(arbitrumWeth?.logo);
  assert.equal(logoForTokenSymbol("WETH"), arbitrumWeth.logo);
});

test("returns no cross-chain logo for an unknown token symbol", () => {
  assert.equal(logoForTokenSymbol("NOT_A_TOKEN"), undefined);
});
