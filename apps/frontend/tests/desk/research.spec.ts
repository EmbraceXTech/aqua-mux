import { expect, test } from "@playwright/test"
import type { Page } from "@playwright/test"

const question =
  "Compare USDC supply opportunities on Base, Arbitrum, and Ethereum over the last seven days."
const workspace = (page: Page) =>
  page.evaluate(() =>
    JSON.parse(localStorage.getItem("coolbar-workspace-v1") ?? "{}")
  )
async function localAccess(page: Page) {
  await page.getByRole("button", { name: /Use my subscription/ }).click()
  await page
    .getByRole("button", { name: /Simulate connection and verification/ })
    .click()
  await expect(
    page.getByRole("heading", { name: "Your demo connection is ready" })
  ).toBeVisible()
  await page.getByRole("button", { name: "Continue to research" }).click()
}

test("starter questions stay editable; filters and bookmarks persist", async ({
  page,
}) => {
  await page.goto("/desk.html")
  await page
    .getByRole("button", { name: /Put your stablecoins to work/ })
    .click()
  await expect(page.getByLabel("Your research question")).toHaveValue(question)
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await page.getByLabel("Filter by network").selectOption("Base")
  await expect(page.locator(".market-table tbody tr")).toHaveCount(1)
  await page.getByLabel("Filter by asset").selectOption("USDT")
  await expect(
    page.getByRole("heading", { name: "No markets match these filters" })
  ).toBeVisible()
  await page.getByRole("button", { name: "Reset filters", exact: true }).click()
  await page
    .getByRole("button", { name: "Save Aave V3 USDC on Base", exact: true })
    .click()
  await page.getByRole("link", { name: /Saved opportunities/ }).click()
  await expect(page.locator(".market-table tbody tr")).toHaveCount(1)
  await page.reload()
  await expect(
    page.getByRole("button", {
      name: "Unsave Aave V3 USDC on Base",
      exact: true,
    })
  ).toHaveAttribute("aria-pressed", "true")
})

test("first send preserves the draft through setup and produces inspectable research", async ({
  page,
}) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.goto("/desk.html")
  await page.getByLabel("Your research question").fill(question)
  await page.getByRole("button", { name: "Send research question" }).click()
  await expect(
    page.getByRole("heading", { name: "How should your research run?" })
  ).toBeVisible()
  await localAccess(page)
  await expect(
    page.getByText("Following the evidence", { exact: true })
  ).toBeVisible()
  await expect(
    page.getByText("Research complete", { exact: true })
  ).toBeVisible()
  await expect(page.locator(".result-table tbody tr")).toHaveCount(5)
  await expect(page.locator(".result-table tbody tr").first()).toContainText(
    "Morpho"
  )
  await expect(page.locator(".result-table tbody tr").first()).toContainText(
    "7.04%"
  )
  await expect(page.getByLabel("Research model")).toHaveValue(
    (await workspace(page)).access.model
  )
  await page.getByRole("button", { name: /source references/ }).click()
  await expect(
    page.getByRole("heading", { name: "The evidence behind the answer" })
  ).toBeVisible()
  await page.getByText("Inspect the calculation", { exact: true }).click()
  await expect(page.locator(".query-details code")).toContainText(
    "periodAPY = sum(observations) / 7"
  )
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await page.getByRole("button", { name: "Show APY data table" }).click()
  await expect(page.locator(".data-table tbody tr")).toHaveCount(7)
  expect((await workspace(page)).threads[0].messages[0].context).toBe(false)
  expect(errors).toEqual([])
})

test("paid research settles on completion and cannot exceed the approved cap", async ({
  page,
}) => {
  await page.goto("/desk.html")
  await page.getByLabel("Your research question").fill(question)
  await page.getByRole("button", { name: "Send research question" }).click()
  await page.getByRole("button", { name: /Pay per request/ }).click()
  await page.getByLabel("Maximum research budget in USDC").fill("0.04")
  await page
    .getByRole("checkbox", { name: /I approve this demo spending cap/ })
    .check()
  await page.getByRole("button", { name: "Approve demo budget" }).click()
  await page.getByRole("button", { name: "Continue to research" }).click()
  expect((await workspace(page)).access.spent).toBe(0)
  await expect(
    page.getByText("Research complete", { exact: true })
  ).toBeVisible()
  expect((await workspace(page)).access.spent).toBe(0.04)
  await page
    .getByLabel("Your research question")
    .fill("Compare Aave USDC on Ethereum and Base over the last seven days.")
  await page.getByRole("button", { name: "Send research question" }).click()
  await expect(
    page.getByRole("status").filter({ hasText: /exceeds your approved budget/ })
  ).toBeVisible()
  expect((await workspace(page)).threads[0].messages).toHaveLength(1)
  expect((await workspace(page)).access.spent).toBe(0.04)
})

test("setup alone does not send; stopping research does not settle a charge", async ({
  page,
}) => {
  await page.goto("/desk.html")
  await page.getByRole("button", { name: "Choose AI access" }).click()
  await localAccess(page)
  expect((await workspace(page)).threads).toHaveLength(0)
  await page.getByLabel("Your research question").fill(question)
  await page.getByRole("button", { name: "Send research question" }).click()
  await page.getByRole("button", { name: "Stop research" }).click()
  await expect(page.getByText("Research paused", { exact: true })).toBeVisible()
  expect((await workspace(page)).activity).toHaveLength(0)
  await page.getByRole("button", { name: "Try this question again" }).click()
  await expect(page.getByLabel("Your research question")).toHaveValue(question)
})

test("pool fees are separate from lending APYs and unsupported coverage is explicit", async ({
  page,
}) => {
  await page.goto("/desk.html")
  await page.getByRole("tab", { name: /Liquidity pools/ }).click()
  await expect(page.locator(".market-table")).toContainText("Fees / 3d")
  await expect(page.locator(".market-table")).not.toContainText("Supply APY")
  await page.getByRole("button", { name: "Choose AI access" }).click()
  await localAccess(page)
  await page
    .getByLabel("Your research question")
    .fill("Compare Solana staking rewards this month.")
  await page.getByRole("button", { name: "Send research question" }).click()
  await expect(
    page.getByRole("heading", { name: "Let's keep this inside the evidence." })
  ).toBeVisible()
  await expect(
    page.getByText(
      "No values or transaction routes were invented to fill the gap.",
      { exact: false }
    )
  ).toBeVisible()
  await expect(page.getByRole("button", { name: "Review supply" })).toHaveCount(
    0
  )
})

test("mobile navigation, dark theme, and dialogs fit the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto("/desk.html")
  await expect(
    page.getByRole("heading", { name: "What would you like to understand?" })
  ).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390
  )
  await page.getByRole("button", { name: "Open navigation" }).click()
  await page.getByRole("button", { name: "Workspace settings" }).click()
  await page.getByLabel("Appearance").selectOption("dark")
  await page.getByRole("button", { name: "Close dialog" }).click()
  await page.getByRole("link", { name: "Portfolio", exact: true }).click()
  await expect(page.locator("html")).toHaveClass("dark")
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390
  )
  await page.screenshot({
    path: "test-results/desk/mobile-dark-portfolio.png",
    fullPage: true,
    animations: "disabled",
  })
  await page.getByRole("button", { name: "Open navigation" }).click()
  await page.getByRole("link", { name: "Discover", exact: true }).click()
  await page.getByRole("button", { name: "Choose AI access" }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog).toBeVisible()
  const box = await dialog.boundingBox()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(390)
  await page.keyboard.press("Escape")
  await expect(dialog).toHaveCount(0)
})

test("ambiguous investment questions ask for scope without running research", async ({
  page,
}) => {
  await page.goto("/desk.html")
  await page.getByLabel("Your research question").fill("Find the best yield")
  await page.getByRole("button", { name: "Send research question" }).click()
  await expect(
    page.getByRole("heading", { name: "What would you like to compare?" })
  ).toBeVisible()
  await page
    .getByRole("button", { name: "USDC lending across three networks" })
    .click()
  await expect(page.getByLabel("Your research question")).toHaveValue(
    "Find the best yield Focus on USDC supply on Ethereum, Base, and Arbitrum over the last seven days."
  )
  expect((await workspace(page)).threads).toHaveLength(0)
  expect((await workspace(page)).access).toBeNull()
})

test("restricted browser storage does not prevent the app from opening", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("Storage access denied", "SecurityError")
      },
    })
  })
  await page.goto("/desk.html")
  await expect(
    page.getByRole("heading", { name: "What would you like to understand?" })
  ).toBeVisible()
})
