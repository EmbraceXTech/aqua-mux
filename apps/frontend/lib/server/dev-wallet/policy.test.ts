import assert from "node:assert/strict";
import { test } from "node:test";
import { encodeFunctionData, erc20Abi, parseAbi } from "viem";
import { AQUA, SWAP_VM, tokens } from "../../config";
import type { Plan } from "../../model";
import { assertDevChain, assertLocalRequest, devAccount } from "./config";
import { planDigest, validateDevPlan } from "./policy";

const maker = "0x0000000000000000000000000000000000000001";
function plan(): Plan {
  return {
    account: maker,
    chainId: 56,
    mode: "liquidity",
    createdAt: Date.now(),
    expiresAt: Date.now() + 30_000,
    calls: [
      {
        to: AQUA,
        data: encodeFunctionData({
          abi: parseAbi([
            "function dock(address app,bytes32 strategyHash,address[] tokens)",
          ]),
          functionName: "dock",
          args: [SWAP_VM, `0x${"00".repeat(32)}`, []],
        }),
        value: "0x0",
        label: "Trusted compiler fixture",
      },
    ],
    strategies: [],
    summary: [],
  };
}

test("maker, expiry, chain, digest and self-call boundaries", () => {
  const value = plan();
  validateDevPlan(value, maker);
  assert.throws(() => validateDevPlan(value, AQUA), /maker/);
  assert.throws(
    () => validateDevPlan({ ...value, expiresAt: 1 }, maker),
    /expired/,
  );
  assert.throws(
    () => validateDevPlan({ ...value, chainId: 46630 }, maker),
    /Unsupported/,
  );
  assert.throws(
    () =>
      validateDevPlan(
        { ...value, calls: [{ ...value.calls[0], to: maker }] },
        maker,
      ),
    /Invalid call/,
  );
  assert.notEqual(
    planDigest(value),
    planDigest({ ...value, expiresAt: value.expiresAt + 1 }),
  );
  assert.notEqual(
    planDigest(value),
    planDigest({ ...value, calls: [{ ...value.calls[0], value: "0x1" }] }),
  );
});

test("only compiler targets, wrapping and allowed token approvals pass", () => {
  const value = plan();
  const token = tokens(56).find((asset) => asset.symbol === "WBNB")!;
  const approval = {
    to: token.address,
    value: "0x0" as const,
    label: "Approve",
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [AQUA, 1n],
    }),
  };
  validateDevPlan({ ...value, calls: [approval] }, maker);
  assert.throws(
    () =>
      validateDevPlan(
        {
          ...value,
          calls: [
            {
              ...approval,
              data: encodeFunctionData({
                abi: erc20Abi,
                functionName: "approve",
                args: [maker, 1n],
              }),
            },
          ],
        },
        maker,
      ),
    /Unapproved/,
  );
  assert.throws(
    () =>
      validateDevPlan(
        {
          ...value,
          calls: [
            {
              ...approval,
              data: encodeFunctionData({
                abi: erc20Abi,
                functionName: "transfer",
                args: [maker, 1n],
              }),
            },
          ],
        },
        maker,
      ),
    /Unapproved/,
  );
  assert.throws(
    () =>
      validateDevPlan(
        { ...value, calls: [{ ...approval, value: "0x1" }] },
        maker,
      ),
    /Unapproved/,
  );
});

test("local mode is opt-in, development-only, origin scoped and rejects proxies", () => {
  const original = { ...process.env };
  try {
    Object.assign(process.env, { NODE_ENV: "development" });
    process.env.AQUAMUX_DEV_WALLET = "true";
    process.env.AQUAMUX_DEV_WALLET_ORIGIN = "http://127.0.0.1:3100";
    const request = (headers = {}) =>
      new Request("http://127.0.0.1:3100/api/dev-wallet/connect", {
        method: "POST",
        headers: {
          host: "127.0.0.1:3100",
          origin: "http://127.0.0.1:3100",
          "content-type": "application/json",
          "x-aquamux-dev-wallet": "manual",
          ...headers,
        },
      });
    assertLocalRequest(request());
    assertLocalRequest(
      new Request("http://localhost:3100/api/dev-wallet/connect", request()),
    );
    assert.throws(
      () =>
        assertLocalRequest(
          new Request(
            "http://localhost:3101/api/dev-wallet/connect",
            request(),
          ),
        ),
      /loopback/,
    );
    assert.throws(
      () =>
        assertLocalRequest(
          new Request(
            "http://remote.example:3100/api/dev-wallet/connect",
            request(),
          ),
        ),
      /loopback/,
    );
    assertLocalRequest(
      request({
        "x-forwarded-host": "127.0.0.1:3100",
        "x-forwarded-for": "::ffff:127.0.0.1",
      }),
    );
    for (const headers of [
      { origin: "https://evil.example" },
      { host: "evil.example" },
      { "x-forwarded-for": "192.0.2.1" },
      { "sec-fetch-site": "cross-site" },
      { forwarded: "for=127.0.0.1" },
      { "x-aquamux-dev-wallet": "" },
    ])
      assert.throws(() => assertLocalRequest(request(headers)), /loopback/);
    Object.assign(process.env, { NODE_ENV: "production" });
    assert.throws(() => assertLocalRequest(request()), /disabled/);
    assert.throws(() => devAccount(), /disabled/);
    Object.assign(process.env, { NODE_ENV: "development" });
    process.env.AQUAMUX_DEV_WALLET = "false";
    assert.throws(() => assertLocalRequest(request()), /disabled/);
  } finally {
    process.env = original;
  }
  for (const chain of [1, 56, 42161, 4663]) assertDevChain(chain);
  for (const chain of [97, 421614, 46630])
    assert.throws(() => assertDevChain(chain));
});
