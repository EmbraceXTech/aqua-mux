import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Page } from "@playwright/test";
import type { LPStrategyConfig } from "../lib/managed";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

export const base = {
  address: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1" as const,
  decimals: 18,
  symbol: "WETH",
};
export const quote = {
  address: "0xaf88d065e77c8cc2239327c5edb3a432268e5831" as const,
  decimals: 6,
  symbol: "USDC",
};
export async function openManaged(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Strategies", exact: true }).click();
}
export async function connectDev(page: Page) {
  await openManaged(page);
  await page
    .getByRole("button", { name: "Use local development wallet", exact: true })
    .click();
  await expect(
    page.getByText("Local development wallet", { exact: true }),
  ).toBeVisible();
}
export async function authenticateFixture(page: Page) {
  const account = privateKeyToAccount(generatePrivateKey());
  await page.goto("/");
  const challenge = await page.evaluate(async (owner) => {
    const response = await fetch("/api/auth/challenge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner, chainId: 42161 }),
    });
    if (!response.ok) throw new Error(`Challenge failed (${response.status}).`);
    return response.json() as Promise<{ id: string; message: string }>;
  }, account.address);
  const signature = await account.signMessage({ message: challenge.message });
  await page.evaluate(
    async ({ id, signature }) => {
      const response = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, signature }),
      });
      if (!response.ok)
        throw new Error(`Verification failed (${response.status}).`);
      const session = await response.json();
      sessionStorage.setItem(
        "aquamux-managed-session-v1",
        JSON.stringify({ ...session, mode: "external" }),
      );
    },
    { id: challenge.id, signature },
  );
  await page.reload();
  await page.getByRole("button", { name: "Strategies", exact: true }).click();
  await expect(
    page.getByText("Authenticated wallet", { exact: true }),
  ).toBeVisible();
}
export async function createDraft(page: Page) {
  return page.evaluate(
    async ({ base, quote }) => {
      const session = JSON.parse(
        sessionStorage.getItem("aquamux-managed-session-v1")!,
      );
      const maker = session.owner.toLowerCase();
      const limit = <T>(value: T) => ({
        value,
        enforcedBy: "execution-broker" as const,
      });
      const config: LPStrategyConfig = {
        version: 1,
        recipeVersion: 1,
        family: "lp",
        recipeId: "wide-range-lp",
        chainId: 42161,
        maker,
        pairs: [
          {
            baseToken: base,
            quoteToken: quote,
            baseAmount: "1000000000000000",
            quoteAmount: "2500000",
            feeBps: 5,
            openingPrice: {
              baseToken: base.address,
              quoteToken: quote.address,
              numerator: "2500123456789123456789",
              denominator: "1000000000000000000",
            },
            range: { kind: "full" },
          },
        ],
        policy: {
          id: `e2e-${crypto.randomUUID()}`,
          version: 1,
          intervalMs: limit(60_000),
          cooldownMs: limit(60_000),
          maxActions: limit(2),
          spendBudgets: limit([]),
          gasBudgetWei: limit("300000000000000"),
          allowedAssets: limit([base.address, quote.address]),
          allowedRoutes: limit([]),
          maxSlippageBps: limit(50),
          maxReferenceAgeMs: limit(60_000),
          expiresAt: limit(Date.now() + 3600_000),
          allowedActions: limit(["hold", "fund-and-open", "close"]),
          triggers: limit({
            rangeExit: false,
            inventoryDriftBps: 1000,
            upwardOnly: false,
          }),
        },
      };
      const response = await fetch("/api/managed/groups", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({ config, mode: "manual" }),
      });
      if (!response.ok)
        throw new Error(`Draft creation failed (${response.status}).`);
      const result = await response.json();
      return { id: result.group.id as string, config };
    },
    { base, quote },
  );
}
export async function readGroup(page: Page, id: string) {
  return page.evaluate(async (groupId) => {
    const session = JSON.parse(
      sessionStorage.getItem("aquamux-managed-session-v1")!,
    );
    const response = await fetch(`/api/managed/groups/${groupId}`, {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    if (!response.ok)
      throw new Error(`Group read failed (${response.status}).`);
    return response.json();
  }, id);
}

export async function captureManaged(page: Page, name: string) {
  const directory = resolve(
    import.meta.dirname,
    "../../../references/ethglobal-competitive-analysis/screenshots/managed",
  );
  mkdirSync(directory, { recursive: true });
  await page.screenshot({
    path: resolve(directory, `${name}.png`),
    fullPage: true,
  });
}
