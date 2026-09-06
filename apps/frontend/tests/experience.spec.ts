import { expect, test } from "@playwright/test"

test("complete research, wallet supply, persisted portfolio and explicit follow-up", async ({
  page,
}) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.goto("/")
  await page
    .getByRole("button", { name: "Put your stablecoins to work" })
    .click()
  await expect(
    page.getByRole("textbox", { name: "Research question", exact: true })
  ).toHaveValue(/Compare USDC/)
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await page.getByRole("button", { name: "Send research question" }).click()
  await page.getByRole("button", { name: "Simulate connection" }).click()
  await expect(
    page.getByRole("button", { name: "Continue with my subscription" })
  ).toBeEnabled()
  await page
    .getByRole("button", { name: "Continue with my subscription" })
    .click()
  await expect(
    page.getByText("Research complete", { exact: true })
  ).toBeVisible({ timeout: 10000 })
  await page
    .getByRole("button", { name: "Inspect sources & methodology" })
    .click()
  await page.getByRole("button", { name: "Methodology", exact: true }).click()
  await expect(
    page.getByText("Arithmetic mean of daily APY samples")
  ).toBeVisible()
  await page.keyboard.press("Escape")
  await page.getByRole("button", { name: "Explore opportunity" }).click()
  await page.getByLabel("Amount to supply").fill("2500")
  await page
    .getByRole("button", { name: "Connect demo wallet", exact: true })
    .click()
  await page.getByRole("button", { name: "Prepare transaction" }).click()
  await page.getByRole("button", { name: "Continue to demo wallet" }).click()
  await page.getByRole("button", { name: "Approve demo allowance" }).click()
  await expect(page.getByText("Token approval completed")).toBeVisible()
  await page.getByRole("button", { name: "Confirm demo supply" }).click()
  await expect(page.getByText("2,500.00 USDC supplied")).toBeVisible()
  await page.getByRole("button", { name: "View in portfolio" }).click()
  await expect(page.getByText("2,500.00 USDC", { exact: true })).toBeVisible()
  await page.getByLabel("Select all positions").check()
  await page.getByRole("button", { name: "Include in research" }).click()
  await expect(page.getByText("1 tracked position included")).toBeVisible()
  await page.getByRole("button", { name: "Remove portfolio context" }).click()
  await expect(page.getByText("1 tracked position included")).toHaveCount(0)
  await page.reload()
  await page.getByRole("button", { name: "Portfolio", exact: true }).click()
  await page.getByRole("button", { name: "Read demo portfolio" }).click()
  await expect(page.getByText("2,500.00 USDC", { exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test("paid setup validates budget and stops research at the cap", async ({
  page,
}) => {
  await page.goto("/")
  await page
    .getByRole("button", { name: "Put your stablecoins to work" })
    .click()
  await page.getByRole("button", { name: "Send research question" }).click()
  await page
    .getByRole("button", { name: "Pay per request", exact: true })
    .click()
  await page.getByLabel("Maximum research budget").fill("0.05")
  await page
    .getByRole("button", { name: "Approve demo budget & continue" })
    .click()
  await expect(page.getByRole("alert")).toContainText("at least 0.12")
  await page.getByLabel("Maximum research budget").fill("0.12")
  await page
    .getByRole("button", { name: "Approve demo budget & continue" })
    .click()
  await expect(
    page.getByText("Research complete", { exact: true })
  ).toBeVisible({ timeout: 10000 })
  await page
    .getByRole("textbox", { name: "Research question", exact: true })
    .fill("Compare USDC supply opportunities again")
  await page.getByRole("button", { name: "Send research question" }).click()
  await expect(page.getByRole("alert")).toContainText("reached its cap")
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("coolbar-access")!).spent
    )
  ).toBe(0.12)
})

test("filters, mobile navigation, dark theme, and dialog keyboard focus", async ({
  page,
}) => {
  await page.goto("/")
  await page.getByLabel("Filter by chain").selectOption("Base")
  await page.getByLabel("Filter by asset").selectOption("DAI")
  await expect(page.getByText("No markets match these filters")).toBeVisible()
  await page.getByRole("button", { name: "Reset filters", exact: true }).click()
  await expect(page.locator("tbody tr")).toHaveCount(5)
  await page
    .getByRole("button", { name: "Liquidity pools", exact: true })
    .click()
  await expect(
    page.getByText("Trading fees are not net returns.")
  ).toBeVisible()
  await page.getByRole("button", { name: "Toggle color theme" }).click()
  await expect(page.locator("html")).toHaveClass("dark")
  await page.screenshot({
    path: "/tmp/coolbar-review/dark-desktop.png",
    fullPage: true,
  })
  await page.getByRole("button", { name: "Toggle color theme" }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole("button", { name: "Open navigation" }).click()
  await page.getByRole("button", { name: "AI access", exact: true }).click()
  await expect(
    page.getByRole("heading", { name: "Your research companion." })
  ).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390
  )
  await page
    .getByRole("button", { name: "Set up AI access", exact: true })
    .last()
    .click()
  await page.keyboard.press("Tab")
  expect(
    await page.evaluate(
      () => !!document.activeElement?.closest("[role=dialog]")
    )
  ).toBe(true)
  await page.keyboard.press("Shift+Tab")
  expect(
    await page.evaluate(
      () => !!document.activeElement?.closest("[role=dialog]")
    )
  ).toBe(true)
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await page.getByRole("button", { name: "Open navigation" }).click()
  await page.getByRole("button", { name: "Discover", exact: true }).click()
  await page
    .getByRole("button", { name: "Stablecoin supply", exact: true })
    .click()
  await page.screenshot({
    path: "/tmp/coolbar-review/discover-mobile.png",
    fullPage: true,
  })
})

test("wrong network, rejected signature and quote recovery preserve completed steps", async ({
  page,
}) => {
  await page.goto("/")
  await page.locator(".asset-cell").first().click()
  await page
    .getByRole("button", { name: "Connect demo wallet", exact: true })
    .click()
  await page.getByText("Prototype state previews", { exact: true }).click()
  await page
    .getByLabel("Simulate a transaction condition")
    .selectOption("Wrong network")
  await page.getByRole("button", { name: "Prepare transaction" }).click()
  await page.getByRole("button", { name: "Continue to demo wallet" }).click()
  await page
    .getByRole("button", { name: "Switch demo network to Base" })
    .click()
  await page.getByRole("button", { name: "Approve demo allowance" }).click()
  await page
    .getByLabel("Simulate a transaction condition")
    .selectOption("Rejected signature")
  await page.getByRole("button", { name: "Confirm demo supply" }).click()
  await expect(page.getByRole("alert")).toContainText("Signature rejected")
  await expect(page.getByText("Token approval completed")).toBeVisible()
  await page
    .getByLabel("Simulate a transaction condition")
    .selectOption("Normal flow")
  await page.getByRole("button", { name: "Confirm demo supply" }).click()
  await expect(page.getByText("1,000.00 USDC supplied")).toBeVisible()
})

test("ETH swap quote recovery and immediate position persistence on success", async ({
  page,
}) => {
  await page.goto("/")
  await page.locator(".asset-cell").first().click()
  await page
    .getByRole("button", { name: "Connect demo wallet", exact: true })
    .click()
  await page.getByLabel("Fund with").selectOption("ETH")
  await page.getByText("Prototype state previews", { exact: true }).click()
  await page
    .getByLabel("Simulate a transaction condition")
    .selectOption("Expired quote")
  await page.getByRole("button", { name: "Prepare transaction" }).click()
  await expect(page.getByText("First, swap ETH to USDC")).toBeVisible()
  await page.getByRole("button", { name: "Continue to demo wallet" }).click()
  await page.getByRole("button", { name: "Confirm demo swap" }).click()
  await expect(page.getByRole("alert")).toContainText("quote expired")
  await page.getByRole("button", { name: "Refresh demo quote" }).click()
  await page.getByRole("button", { name: "Confirm demo swap" }).click()
  await page.getByRole("button", { name: "Approve demo allowance" }).click()
  await page.getByRole("button", { name: "Confirm demo supply" }).click()
  await expect(page.getByText("1,000.00 USDC supplied")).toBeVisible()
  await page.getByRole("button", { name: "Close dialog" }).click()
  await page.reload()
  await page.getByRole("button", { name: "Portfolio", exact: true }).click()
  await page.getByRole("button", { name: "Read demo portfolio" }).click()
  await expect(page.getByText("1,000.00 USDC", { exact: true })).toBeVisible()
})

test("research follows selected assets and ignores unrelated discovery filters", async ({
  page,
}) => {
  await page.goto("/")
  await page.evaluate(() =>
    localStorage.setItem(
      "coolbar-access",
      JSON.stringify({
        type: "own",
        model: "Claude Sonnet",
        budget: 0,
        spent: 0,
      })
    )
  )
  await page.reload()
  await page.getByLabel("Filter by chain").selectOption("Base")
  await page
    .getByRole("textbox", { name: "Research question", exact: true })
    .fill("Compare USDT supply on Ethereum over the last seven days")
  await page.getByRole("button", { name: "Send research question" }).click()
  await expect(
    page.getByRole("heading", {
      name: "Ethereum USDT supply, with the numbers in view.",
    })
  ).toBeVisible({ timeout: 10000 })
  await expect(page.locator(".result-table tbody tr")).toHaveCount(1)
  await page
    .getByRole("textbox", { name: "Research question", exact: true })
    .fill(
      "Compare Uniswap ETH stablecoin pool fees on all chains over the last seven days"
    )
  await page.getByRole("button", { name: "Send research question" }).click()
  await expect(
    page.getByText("Research complete", { exact: true })
  ).toBeVisible({ timeout: 10000 })
  await expect(page.locator(".result-table tbody tr")).toHaveCount(3)
})
