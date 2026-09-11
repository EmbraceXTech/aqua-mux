import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "../app/api/tokens/route";
import { POST } from "../app/api/tokens/validate/route";

test("token search endpoint rejects unsupported chains and unbounded input", async () => {
  const unsupported = await GET(
    new Request("http://localhost/api/tokens?chainId=8453"),
  );
  assert.equal(unsupported.status, 400);
  assert.match((await unsupported.json()).error, /Unsupported/);

  const longQuery = await GET(
    new Request(`http://localhost/api/tokens?chainId=1&q=${"a".repeat(81)}`),
  );
  assert.equal(longQuery.status, 400);
  assert.match((await longQuery.json()).error, /too long/);

  const zeroLimit = await GET(
    new Request("http://localhost/api/tokens?chainId=1&limit=0"),
  );
  assert.equal(zeroLimit.status, 400);
  assert.match((await zeroLimit.json()).error, /positive/);
});

test("token validation endpoint requires raw integer amounts", async () => {
  const response = await POST(
    new Request("http://localhost/api/tokens/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chainId: 1,
        src: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
        dst: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        amount: "1.5",
      }),
    }),
  );
  assert.equal(response.status, 400);
});
