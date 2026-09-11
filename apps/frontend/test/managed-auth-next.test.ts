import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const origin = process.env.AQUAMUX_AUTH_E2E_ORIGIN;

// Opt in against an already running, loopback-bound Next server configured with
// the same AQUAMUX_AUTH_ORIGIN. Never loads a funded wallet or submits a trade.
test(
  "Next browser wallet proof, originless managed read, and logout",
  {
    skip: !origin,
  },
  async () => {
    const target = new URL(origin!);
    assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(target.hostname));
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(origin!);
      const owner = privateKeyToAccount(generatePrivateKey());
      const challenge = await page.evaluate(async (owner) => {
        const response = await fetch("/api/auth/challenge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ owner, chainId: 42161 }),
        });
        return { status: response.status, body: await response.json() };
      }, owner.address);
      assert.equal(challenge.status, 200);
      const signature = await owner.signMessage({
        message: challenge.body.message,
      });
      const session = await page.evaluate(
        async ({ id, signature }) => {
          const response = await fetch("/api/auth/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, signature }),
          });
          return { status: response.status, body: await response.json() };
        },
        { id: challenge.body.id, signature },
      );
      assert.equal(session.status, 200);
      const token = session.body.token as string;
      const read = () =>
        page.evaluate(async (token) => {
          const response = await fetch("/api/managed/groups", {
            headers: { Authorization: `Bearer ${token}` },
          });
          return { status: response.status, body: await response.json() };
        }, token);
      const pendingRead = page.waitForRequest((request) =>
        request.url().endsWith("/api/managed/groups"),
      );
      const groups = await read();
      const readHeaders = await (await pendingRead).allHeaders();
      assert.equal(readHeaders.origin, undefined);
      assert.equal(readHeaders["sec-fetch-site"], "same-origin");
      assert.equal(groups.status, 200);
      assert.deepEqual(groups.body.groups, []);
      const hostileHeaders: Record<string, string>[] = [
        { Origin: "http://evil.test" },
        { Origin: `${target.protocol}//${target.hostname}:1` },
        { "X-Forwarded-For": "203.0.113.8" },
        { "X-Forwarded-Host": "evil.test" },
        { "X-Forwarded-Port": "1" },
      ];
      for (const headers of hostileHeaders) {
        const response = await fetch(`${origin}/api/managed/groups`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Origin: origin!,
            ...headers,
          },
        });
        assert.equal(response.status, 403);
      }
      const missingOrigin = await fetch(`${origin}/api/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(missingOrigin.status, 403);
      const logout = await page.evaluate(async (token) => {
        const response = await fetch("/api/auth/logout", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: "{}",
        });
        return response.status;
      }, token);
      assert.equal(logout, 200);
      assert.equal((await read()).status, 401);
    } finally {
      await browser.close();
    }
  },
);
