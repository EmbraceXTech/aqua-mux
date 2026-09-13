import assert from "node:assert/strict";
import { test } from "node:test";
import { portfolioCsv } from "../lib/utils/portfolio-export";
import type { PortfolioAsset } from "../types/portfolio";

const asset: PortfolioAsset = {
  address: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  symbol: "ETH",
  name: "Ether",
  decimals: 18,
  logo: "",
  source: "test",
  chainId: 42161,
  balance: "2.123456789012345678",
};

test("portfolio CSV preserves balance precision and network", () => {
  const csv = portfolioCsv([asset], []);
  assert.equal(
    csv.split("\r\n")[1],
    '"Wallet asset","ETH","Arbitrum","2.123456789012345678","","",""',
  );
});

test("portfolio CSV quotes metadata and neutralizes formula prefixes", () => {
  for (const prefix of ["=", "+", "-", "@", "\t", "\r"]) {
    const csv = portfolioCsv(
      [{ ...asset, symbol: `${prefix}token,"quoted"` }],
      [],
    );
    assert.ok(csv.includes(`"'${prefix}token,""quoted"""`));
  }
});

test("empty portfolio CSV includes only the header", () => {
  assert.equal(
    portfolioCsv([], []),
    '"Record","Asset","Network","Balance","Status","Range","Fee percent"',
  );
});
