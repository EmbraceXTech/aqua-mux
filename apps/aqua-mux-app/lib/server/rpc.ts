import { createPublicClient, defineChain, http } from "viem";
import { network } from "../config";
export function client(id: number) {
  const n = network(id);
  const url = process.env[n.env];
  if (!url) throw new Error(`RPC is not configured for ${n.name}.`);
  return createPublicClient({
    chain: defineChain({
      id: n.id,
      name: n.name,
      nativeCurrency: { name: n.symbol, symbol: n.symbol, decimals: 18 },
      rpcUrls: { default: { http: [url] } },
    }),
    transport: http(url, { timeout: 12000, retryCount: 1 }),
  });
}
export function failure(error: unknown, status = 400) {
  const message = error instanceof Error ? error.message : "Request failed.";
  return Response.json(
    {
      error: /https?:|fetch failed|HTTP request|timeout|timed out/i.test(
        message,
      )
        ? "Network request failed. Please retry."
        : message.slice(0, 300),
    },
    { status },
  );
}
