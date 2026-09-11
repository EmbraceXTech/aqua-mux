import { createServer } from "node:http";
import { once } from "node:events";
import { managedApi } from "../../lib/server/managed-service/http";
import { walletAuth } from "../../lib/server/auth";
import type { PrivateKeyAccount } from "viem";

/** A real local HTTP boundary around the production handler, used only by fork verification. */
export async function managedHttp(account: PrivateKeyAccount, chainId: number) {
  let origin = "";
  const server = createServer(async (incoming, outgoing) => {
    const chunks: Buffer[] = [];
    for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
    const response = await managedApi(
      new Request(`${origin}${incoming.url}`, {
        method: incoming.method,
        headers: incoming.headers as Record<string, string>,
        ...(["POST", "PATCH"].includes(incoming.method ?? "")
          ? { body: Buffer.concat(chunks) }
          : {}),
      }),
      incoming.url!.slice(1).split("/"),
    );
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(await response.text());
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing HTTP port");
  origin = `http://127.0.0.1:${address.port}`;
  const oldOrigin = process.env.AQUAMUX_AUTH_ORIGIN;
  process.env.AQUAMUX_AUTH_ORIGIN = origin;
  const auth = walletAuth();
  const challenge = auth.challenge(account.address, origin, chainId);
  const session = await auth.verify(
    challenge.id,
    await account.signMessage({ message: challenge.message }),
    origin,
  );
  return {
    async send(
      path: string,
      value?: unknown,
      method = value === undefined ? "GET" : "POST",
    ) {
      const response = await fetch(`${origin}/${path}`, {
        method,
        headers: {
          Origin: origin,
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.token}`,
        },
        ...(value === undefined ? {} : { body: JSON.stringify(value) }),
      });
      return { status: response.status, data: await response.json() };
    },
    async stop() {
      if (oldOrigin === undefined) delete process.env.AQUAMUX_AUTH_ORIGIN;
      else process.env.AQUAMUX_AUTH_ORIGIN = oldOrigin;
      server.close();
      await once(server, "close");
    },
  };
}
