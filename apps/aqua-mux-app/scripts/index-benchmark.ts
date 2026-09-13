import { indexBenchmarks } from "../lib/server/benchmark/indexer";
const args = process.argv.slice(2);
const value = (name: string, fallback: string) =>
  args.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1] ?? fallback;
const result = await indexBenchmarks({
  candidates: Number(value("candidates", "5")),
  days: Number(value("days", "30")),
  skip: args.some((arg) => arg.startsWith("--skip="))
    ? Number(value("skip", "0"))
    : undefined,
  sourceIds: value("sources", "").split(",").filter(Boolean),
  log: console.log,
});
console.log(
  JSON.stringify(
    {
      positions: result.positions.length,
      wallets: new Set(result.positions.map((p) => p.wallet)).size,
      sources: result.coverage.map((s) => ({
        id: s.id,
        status: s.status,
        verified: s.verified,
        error: s.error,
      })),
    },
    null,
    2,
  ),
);
