import react from "@vitejs/plugin-react";
import { PrivyClient } from "@privy-io/node";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

const pocRoot = resolve(import.meta.dirname, "..");
const localOrigin = "http://127.0.0.1:3410";

function valueFromFile(path: string, name: string) {
  const match = readFileSync(path, "utf8").match(new RegExp(`^${name}=(.*)$`, "m"));
  if (!match?.[1]) throw new Error(`Missing ${name} in local runtime configuration.`);
  return match[1].trim().replace(/^['"]|['"]$/g, "");
}

const appId = valueFromFile(resolve(pocRoot, ".env"), "PRIVY_APP_ID");
const appSecret = valueFromFile(resolve(pocRoot, ".env"), "PRIVY_APP_SECRET");
const signerId = valueFromFile(resolve(pocRoot, ".runtime/privy-agent.env"), "POC_SIGNER_KEY_QUORUM_ID");
const clientId = valueFromFile(resolve(pocRoot, ".runtime/privy-client.env"), "PRIVY_CLIENT_ID");
const privy = new PrivyClient({ appId, appSecret });

type ProvisionRequest = {
  userId?: string;
  walletAddress?: string;
  walletId?: string;
};

function sendJson(response: import("node:http").ServerResponse, status: number, body: object) {
  response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
}

function ownerApi(): Plugin {
  return {
    name: "poc-owner-api",
    configureServer(server) {
      server.middlewares.use("/api/provision", async (request, response) => {
        if (request.method !== "POST" || request.headers.origin !== localOrigin) {
          sendJson(response, 405, { error: "method_or_origin_refused" });
          return;
        }
        const chunks: Buffer[] = [];
        for await (const chunk of request) {
          chunks.push(Buffer.from(chunk));
          if (Buffer.concat(chunks).length > 10_000) {
            sendJson(response, 413, { error: "request_too_large" });
            return;
          }
        }
        let input: ProvisionRequest;
        let stage = "parse_input";
        try {
          input = JSON.parse(Buffer.concat(chunks).toString("utf8")) as ProvisionRequest;
          const walletAddress = input.walletAddress;
          const userId = input.userId;
          if (!/^did:privy:[a-z0-9]+$/i.test(userId ?? "") || !/^0x[0-9a-fA-F]{40}$/.test(walletAddress ?? "") || !input.walletId || !walletAddress || !userId) throw new Error("input");
          const expiresAt = Math.floor(Date.now() / 1_000) + 300;
          stage = "create_policy";
          const policy = await privy.policies().create({
            version: "1.0",
            name: "AquaMux POC Sepolia zero-value self-transfer only",
            chain_type: "ethereum",
            owner: { user_id: userId },
            rules: [
              {
                name: "Allow zero-value Sepolia self-transfer",
                method: "eth_sendTransaction",
                action: "ALLOW",
                conditions: [
                  { field_source: "ethereum_transaction", field: "to", operator: "eq", value: walletAddress },
                  { field_source: "ethereum_transaction", field: "chain_id", operator: "eq", value: "11155111" },
                  { field_source: "ethereum_transaction", field: "value", operator: "eq", value: "0x0" },
                  { field_source: "system", field: "current_unix_timestamp", operator: "lt", value: String(expiresAt) },
                ],
              },
              { name: "Deny batches", method: "wallet_sendCalls", action: "DENY", conditions: [] },
              { name: "Deny raw transaction signing", method: "eth_signTransaction", action: "DENY", conditions: [] },
              { name: "Deny user operations", method: "eth_signUserOperation", action: "DENY", conditions: [] },
              { name: "Deny arbitrary messages", method: "personal_sign", action: "DENY", conditions: [] },
              { name: "Deny typed-data signatures", method: "eth_signTypedData_v4", action: "DENY", conditions: [] },
              { name: "Deny EIP-7702 authorization", method: "eth_sign7702Authorization", action: "DENY", conditions: [] },
              { name: "Deny key export", method: "exportPrivateKey", action: "DENY", conditions: [] },
              { name: "Deny seed export", method: "exportSeedPhrase", action: "DENY", conditions: [] },
            ],
          });
          sendJson(response, 200, { policyId: policy.id, signerId, expiresAt });
        } catch (error) {
          const candidate = error as { constructor?: { name?: string }; status?: unknown; code?: unknown };
          const failure = {
            stage,
            type: candidate?.constructor?.name ?? "Error",
            status: typeof candidate?.status === "number" ? candidate.status : null,
            code: typeof candidate?.code === "string" ? candidate.code : null,
          };
          console.error(JSON.stringify({ ownerPocProvisioningFailure: failure }));
          sendJson(response, 403, { error: stage });
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), ownerApi()],
  define: {
    "import.meta.env.VITE_PRIVY_APP_ID": JSON.stringify(appId),
    "import.meta.env.VITE_PRIVY_CLIENT_ID": JSON.stringify(clientId),
  },
});
