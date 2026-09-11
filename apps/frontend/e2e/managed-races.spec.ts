import { expect, test } from "@playwright/test";
import {
  authenticateFixture,
  createDraft,
  readGroup,
} from "./managed-fixtures";

// These tests inject transport timing and HTTP faults around real authenticated records.
// They do not authorize or submit wallet transactions.
test("Stop stays available while a manual review response is delayed", async ({
  page,
}) => {
  await authenticateFixture(page);
  const draft = await createDraft(page);
  await page.reload();
  await page.getByRole("button", { name: "Strategies", exact: true }).click();
  await page
    .getByRole("button", { name: new RegExp(draft.id.slice(0, 8)) })
    .click();
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**/groups/${draft.id}/proposals`, async (route) => {
    await delayed;
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Injected review transport failure" }),
    });
  });
  const requested = page.waitForRequest((request) =>
    request.url().endsWith(`/groups/${draft.id}/proposals`),
  );
  await page.getByRole("button", { name: "Regenerate fresh review" }).click();
  await requested;
  await page.getByRole("tab", { name: "Controls", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Stop bot", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Stop bot", exact: true }).click();
  expect((await readGroup(page, draft.id)).bot.state).toBe("stopped");
  release();
  await expect(page.locator(".managed-error")).toContainText(
    "Injected review transport failure",
  );
  expect((await readGroup(page, draft.id)).transactions).toHaveLength(0);
});

test("late group response cannot restore a disconnected workspace", async ({
  page,
}) => {
  await authenticateFixture(page);
  const draft = await createDraft(page);
  await page.reload();
  await page.getByRole("button", { name: "Strategies", exact: true }).click();
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**/groups/${draft.id}`, async (route) => {
    const response = await route.fetch();
    await delayed;
    await route.fulfill({ response });
  });
  await page
    .getByRole("button", { name: new RegExp(draft.id.slice(0, 8)) })
    .click();
  await expect(
    page.getByText("Loading durable group records..."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Disconnect managed wallet" }).click();
  release();
  await expect(
    page.getByRole("heading", { name: "Choose how you provide liquidity" }),
  ).toBeVisible();
  await expect(
    page.getByRole("tablist", { name: "Bot workspace" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Connect and authenticate wallet" }),
  ).toBeVisible();
});

test("revoked authentication offers reconnection and clears group records", async ({
  page,
}) => {
  await authenticateFixture(page);
  await page.route("**/api/managed/groups", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: "Injected revoked session" }),
    }),
  );
  await page.getByRole("button", { name: "Swap", exact: true }).click();
  await page.getByRole("button", { name: "Strategies", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Connect and authenticate wallet" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Authentication expired or was revoked. Connect your wallet again.",
    ),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("aquamux-managed-session-v1"),
    ),
  ).toBeNull();
});

test("account change during authentication discards the late session", async ({
  page,
}) => {
  const { generatePrivateKey, privateKeyToAccount } =
    await import("viem/accounts");
  const account = privateKeyToAccount(generatePrivateKey());
  await page.exposeFunction("managedFixtureSign", (message: `0x${string}`) =>
    account.signMessage({ message: { raw: message } }),
  );
  await page.addInitScript((owner) => {
    const callbacks = new Set<(value: unknown) => void>();
    const fixtureWindow = window as typeof window & {
      managedFixtureSign: (message: string) => Promise<string>;
      managedFixtureChange: () => void;
    };
    fixtureWindow.managedFixtureChange = () => {
      for (const callback of callbacks)
        callback(["0x1111111111111111111111111111111111111111"]);
    };
    window.ethereum = {
      request: async ({ method, params }) => {
        if (method === "eth_requestAccounts") return [owner];
        if (method === "personal_sign")
          return fixtureWindow.managedFixtureSign(String(params?.[0]));
        throw new Error("Unexpected wallet call in authentication fixture.");
      },
      on: (event, callback) => {
        if (event === "accountsChanged") callbacks.add(callback);
      },
      removeListener: (event, callback) => {
        if (event === "accountsChanged") callbacks.delete(callback);
      },
    };
  }, account.address);
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/auth/verify", async (route) => {
    const response = await route.fetch();
    await delayed;
    await route.fulfill({ response });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Strategies", exact: true }).click();
  const verifying = page.waitForRequest((request) =>
    request.url().endsWith("/api/auth/verify"),
  );
  await page
    .getByRole("button", { name: "Connect and authenticate wallet" })
    .click();
  await verifying;
  await page.evaluate(() =>
    (
      window as typeof window & { managedFixtureChange: () => void }
    ).managedFixtureChange(),
  );
  release();
  await expect(
    page.getByText(
      "Wallet account changed. Authenticate the selected wallet again.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Connect and authenticate wallet" }),
  ).toBeEnabled();
  await expect(
    page.getByText("Authenticated wallet", { exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("aquamux-managed-session-v1"),
    ),
  ).toBeNull();
});
