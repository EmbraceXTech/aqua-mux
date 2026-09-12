import { createServer } from "node:http";
import { writeFileSync } from "node:fs";
import { once } from "node:events";
import { decodeFunctionData, parseEther, toHex, type Hex } from "viem";
import { NATIVE, classicRouter, networks } from "../lib/config";
import { createPlanPost } from "../lib/server/legacy-handlers";
import { walletAuth } from "../lib/server/auth";
import { ManagedStore } from "../lib/server/store";
import { controlledFork } from "./fixtures/controlled-fork";
import { transparentRouterAbi } from "../lib/server/route-policy/calldata";
import { encodeDevBatch, implementation } from "../lib/server/dev-wallet/batch";

process.loadEnvFile(new URL("../.env", import.meta.url).pathname);
const chainId = 42161;
const setting = networks.find((network) => network.id === chainId)!;
const fork = await controlledFork(chainId, process.env[setting.env]!);
process.env[setting.env] = fork.url;
await fork.request("anvil_setBalance", [
  fork.account.address,
  toHex(parseEther("1")),
]);
await fork.request("anvil_setCode", [
  fork.account.address,
  `0xef0100${implementation.slice(2)}`,
]);
(
  globalThis as typeof globalThis & { aquamuxManagedStore?: ManagedStore }
).aquamuxManagedStore = new ManagedStore(":memory:");
const realFetch = globalThis.fetch;
let attackerResponses = 0;
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (
    url.hostname === "api.1inch.com" &&
    url.pathname.includes("/swap/v6.1/") &&
    url.pathname.endsWith("/swap")
  ) {
    attackerResponses++;
    return Response.json({
      dstAmount: "1000000",
      tx: {
        from: fork.account.address,
        to: classicRouter(chainId),
        value: url.searchParams.get("amount"),
        data: "0xdeadbeef",
      },
    });
  }
  return realFetch(input, init);
};
const handler = createPlanPost();
let origin = "",
  bearer = "";
const basket = {
  chainId,
  mode: "swap",
  source: NATIVE,
  amount: "0.0001",
  slippageBps: 50,
  feeBps: 5,
  range: "full",
  legs: [
    {
      address: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
      bps: 5000,
      amount: "0",
    },
    {
      address: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9",
      bps: 5000,
      amount: "0",
    },
  ],
};
const server = createServer(async (incoming, outgoing) => {
  try {
    if (incoming.url === "/") {
      outgoing.setHeader("Content-Type", "text/html");
      outgoing.end(
        '<!doctype html><title>Public route audit</title><h1>Controlled public route HTTP audit</h1><p>Real fork RPC, synthetic account, adversarial API response, zero broadcasts.</p><button onclick="run()">Run public route audit</button><pre id="result"></pre><script>async function run(){document.querySelector("#result").textContent="Running";const r=await fetch("/fixture-run",{method:"POST"});document.querySelector("#result").textContent=JSON.stringify(await r.json(),null,2)}</script>',
      );
      return;
    }
    if (incoming.url === "/fixture-run") {
      const response = await realFetch(`${origin}/api/plan`, {
        method: "POST",
        headers: {
          Origin: origin,
          "Content-Type": "application/json",
          Authorization: `Bearer ${bearer}`,
        },
        body: JSON.stringify({ basket, account: fork.account.address }),
      });
      const plan = await response.json();
      let batchSimulation = "not attempted";
      if (
        response.ok &&
        plan.calls.every((call: { data: string }) => call.data !== "0xdeadbeef")
      ) {
        await fork.request("eth_call", [
          {
            from: fork.account.address,
            to: fork.account.address,
            data: encodeDevBatch(plan.calls),
          },
          "latest",
        ]);
        batchSimulation = "passed against deployed contracts on local fork";
      }
      const result = {
        status: response.status,
        attackerResponses,
        arbitraryProgramAccepted:
          plan.calls?.some(
            (call: { data: string }) => call.data === "0xdeadbeef",
          ) ?? false,
        calls: plan.calls?.map(
          (call: { to: string; data: Hex; value: string }) => ({
            to: call.to,
            selector: call.data.slice(0, 10),
            value: call.value,
            ...(call.data.startsWith("0x175accdc")
              ? (() => {
                  const decoded = decodeFunctionData({
                    abi: transparentRouterAbi,
                    data: call.data,
                  });
                  return {
                    receiver: toHex(decoded.args[0], { size: 20 }),
                    minimumOut: decoded.args[1].toString(),
                  };
                })()
              : {}),
          }),
        ),
        error: plan.error,
        summary: plan.summary,
        batchSimulation,
        publicBroadcasts: 0,
      };
      writeFileSync(
        "/tmp/aquamux-public-route-audit.json",
        JSON.stringify(result, null, 2),
      );
      outgoing.setHeader("Content-Type", "application/json");
      outgoing.end(JSON.stringify(result));
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
    const response = await handler(
      new Request(`${origin}${incoming.url}`, {
        method: "POST",
        headers: incoming.headers as Record<string, string>,
        body: Buffer.concat(chunks),
      }),
    );
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(await response.text());
  } catch {
    outgoing.statusCode = 500;
    outgoing.end(JSON.stringify({ error: "Controlled audit request failed" }));
  }
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
process.env.AQUAMUX_AUTH_ORIGIN = origin;
const challenge = walletAuth().challenge(fork.account.address, origin, chainId);
bearer = (
  await walletAuth().verify(
    challenge.id,
    await fork.account.signMessage({ message: challenge.message }),
    origin,
  )
).token;
writeFileSync("/tmp/aquamux-public-audit-origin", origin);
console.log(
  JSON.stringify({
    origin,
    evidence:
      "Orca browser authenticated HTTP with adversarial upstream fixture",
    publicBroadcasts: 0,
  }),
);
const stop = () => {
  server.close();
  fork.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
