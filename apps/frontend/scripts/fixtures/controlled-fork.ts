import { spawn } from "node:child_process";
import { createServer } from "node:net";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

export async function controlledFork(chainId: number, upstream: string) {
  const reservation = createServer();
  await new Promise<void>((resolve) =>
    reservation.listen(0, "127.0.0.1", resolve),
  );
  const port = (reservation.address() as { port: number }).port;
  await new Promise<void>((resolve) => reservation.close(() => resolve()));
  const url = `http://127.0.0.1:${port}`;
  const process = spawn(
    "node",
    [
      new URL("../../node_modules/@foundry-rs/anvil/bin.mjs", import.meta.url)
        .pathname,
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--chain-id",
      String(chainId),
      "--fork-url",
      upstream,
      "--silent",
    ],
    { stdio: "ignore" },
  );
  const chain = defineChain({
    id: chainId,
    name: "Controlled fork",
    nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [url] } },
  });
  const rpc = createPublicClient({
    chain,
    transport: http(url, { retryCount: 0 }),
  });
  let ready = false;
  for (let i = 0; i < 120; i++) {
    try {
      if ((await rpc.getChainId()) === chainId) {
        ready = true;
        break;
      }
    } catch {}
    if (process.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!ready) {
    process.kill();
    throw new Error("Isolated fork did not start.");
  }
  // This fixed public test key never holds or signs for a public-network account.
  const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
  const wallet = createWalletClient({ account, chain, transport: http(url) });
  return {
    rpc,
    wallet,
    account,
    url,
    stop: () => process.kill("SIGTERM"),
    request: async (method: string, params: unknown[]) =>
      rpc.request({ method, params } as never),
  };
}
