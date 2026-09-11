import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { setTimeout } from "node:timers/promises";
import type { Address } from "viem";
import { NATIVE, tokens, network } from "../lib/config";
import { quoteLifecycleRoute } from "../lib/server/lifecycle/routes";

// Quote-only CLI: no wallet, signing, simulation override or submission imports.
async function main() {
  const [baselinePath, outputPath] = process.argv.slice(2);
  assert.ok(
    baselinePath && outputPath,
    "Pass baseline JSON and a new output JSON path.",
  );
  process.loadEnvFile(".env");
  const { maker } = JSON.parse(readFileSync(baselinePath, "utf8")) as {
    maker: Address;
  };
  const results = [];
  for (const candidate of [
    { chainId: 42161, symbols: ["USDC", "WBTC"], amount: "50000000000000" },
    { chainId: 56, symbols: ["USDC", "ETH"], amount: "125000000000000" },
    { chainId: 4663, symbols: ["USDG", "PONS"], amount: "50000000000000" },
  ]) {
    for (const symbol of candidate.symbols) {
      const destination = tokens(candidate.chainId).find(
        (token) => token.symbol === symbol,
      );
      assert.ok(destination);
      const startedAt = new Date().toISOString();
      try {
        const route = await quoteLifecycleRoute({
          chainId: candidate.chainId,
          maker: maker.toLowerCase() as Address,
          source: {
            address: NATIVE,
            decimals: 18,
            symbol: network(candidate.chainId).symbol,
          },
          destination,
          amountIn: candidate.amount,
          minimumAmountOut: "1",
          slippageBps: 100,
        });
        results.push({
          chainId: candidate.chainId,
          destination: destination.address,
          symbol,
          amountIn: candidate.amount,
          startedAt,
          status: "accepted-by-current-route-validator",
          amountOut: route.amountOut,
          minimumAmountOut: route.minimumAmountOut,
          target: route.call.to,
          selector: route.call.data.slice(0, 10),
          quotedAt: route.quotedAt,
        });
      } catch (error) {
        // Preserve only local validator messages and the upstream numeric HTTP status.
        const message = error instanceof Error ? error.message : "";
        const allowed =
          /^(Route |Unexpected native value|1inch could not provide a route \(\d+\))/;
        results.push({
          chainId: candidate.chainId,
          destination: destination.address,
          symbol,
          amountIn: candidate.amount,
          startedAt,
          status: "unavailable",
          reason:
            allowed.test(message) &&
            !/https?:|Bearer|0x[0-9a-fA-F]{64}/.test(message)
              ? message.slice(0, 200)
              : "Quote failed; credentials and provider details withheld.",
        });
      }
      await setTimeout(1200);
    }
  }
  const revision = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  writeFileSync(
    outputPath,
    JSON.stringify(
      {
        observedAt: new Date().toISOString(),
        revision,
        transactionsSubmitted: 0,
        claim:
          "Read-only entry quote feasibility. Validator acceptance is not signer approval or complete batch simulation. Quotes expire and cannot authorize later execution.",
        results,
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
  console.log(JSON.stringify(results));
}
main().catch(() => {
  console.error(
    "Read-only quote preflight failed without transaction submission.",
  );
  process.exitCode = 1;
});
