import { createServer } from "node:http";
import { once } from "node:events";
import { writeFileSync } from "node:fs";
import { privateKeyToAccount } from "viem/accounts";
import { ManagedStore } from "../lib/server/store";
import { walletAuth } from "../lib/server/auth";
import { GET as exportOwner } from "../app/api/managed/export/route";
import { createExternalConfig } from "./fixtures/external-config";
const store = new ManagedStore(":memory:");
(
  globalThis as typeof globalThis & { aquamuxManagedStore?: ManagedStore }
).aquamuxManagedStore = store;
const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
for (const [index, signer] of [
  account,
  privateKeyToAccount(`0x${"22".repeat(32)}`),
].entries()) {
  const owner = signer.address.toLowerCase() as `0x${string}`,
    id = `export-fixture-${index}`;
  const config = createExternalConfig({
    chainId: 1,
    maker: owner,
    base: {
      address: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
      decimals: 18,
      symbol: "WETH",
    },
    quotes: [
      {
        address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        decimals: 6,
        symbol: "USDC",
      },
    ],
    amountIn: "1000000000000000",
    initial: [{ minimumAmountOut: "2500000" }],
  });
  store.put(
    "group",
    {
      id,
      owner,
      maker: owner,
      chainId: 1,
      config,
      state: "draft",
      inventory: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    owner,
  );
  store.putDocument("private-fixture", id, owner, {
    privateKey: "FIXTURE_PRIVATE_PAYLOAD",
  });
}
let origin = "",
  bearer = "";
const server = createServer(async (incoming, outgoing) => {
  try {
    if (incoming.url === "/") {
      outgoing.setHeader("Content-Type", "text/html");
      outgoing.end(
        '<!doctype html><title>Owner export audit</title><h1>Authenticated owner export audit</h1><p>Synthetic accounts and isolated memory database; no chain transactions.</p><button onclick="run()">Run export audit</button><pre id="result"></pre><script>async function run(){document.querySelector("#result").textContent="Running";const r=await fetch("/fixture-run",{method:"POST"});document.querySelector("#result").textContent=JSON.stringify(await r.json(),null,2)}</script>',
      );
      return;
    }
    if (incoming.url === "/fixture-run") {
      const response = await fetch(`${origin}/api/managed/export`, {
        headers: { Origin: origin, Authorization: `Bearer ${bearer}` },
      });
      const value = await response.json();
      const anonymous = await fetch(`${origin}/api/managed/export`, {
        headers: { Origin: origin },
      });
      const result = {
        status: response.status,
        anonymousStatus: anonymous.status,
        owner: value.owner,
        groups: value.records?.group.map((g: { id: string }) => g.id),
        privatePayloadExcluded: !JSON.stringify(value).includes(
          "FIXTURE_PRIVATE_PAYLOAD",
        ),
        internalDocumentsExcluded: !("documents" in value),
        attachment: response.headers.get("content-disposition"),
        cacheControl: response.headers.get("cache-control"),
        error: value.error,
        publicBroadcasts: 0,
      };
      writeFileSync(
        "/tmp/aquamux-owner-export-audit.json",
        JSON.stringify(result, null, 2),
      );
      outgoing.setHeader("Content-Type", "application/json");
      outgoing.end(JSON.stringify(result));
      return;
    }
    const response = await exportOwner(
      new Request(`${origin}${incoming.url}`, {
        headers: incoming.headers as Record<string, string>,
      }),
    );
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(await response.text());
  } catch {
    outgoing.statusCode = 500;
    outgoing.end(JSON.stringify({ error: "Controlled export audit failed" }));
  }
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
process.env.AQUAMUX_AUTH_ORIGIN = origin;
const challenge = walletAuth().challenge(account.address, origin, 1);
bearer = (
  await walletAuth().verify(
    challenge.id,
    await account.signMessage({ message: challenge.message }),
    origin,
  )
).token;
console.log(
  JSON.stringify({
    origin,
    evidence: "Orca browser authenticated HTTP; isolated synthetic records",
  }),
);
const stop = () => {
  server.close();
  store.close();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
