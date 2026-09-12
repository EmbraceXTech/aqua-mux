import { PrivyClient } from "@privy-io/node";
import { makeHarmlessSelfTransfer, SEPOLIA_CAIP2 } from "./policy.ts";

const REQUIRED = [
  "PRIVY_APP_ID",
  "PRIVY_APP_SECRET",
  "PRIVY_AGENT_AUTHORIZATION_PRIVATE_KEY",
  "POC_WALLET_ID",
  "POC_WALLET_ADDRESS",
] as const;

type Attempt = "allowed-self" | "positive-value" | "expired-self" | "revoked-self" | "batch-with-harmful-call";

function requireEnvironment(name: (typeof REQUIRED)[number]) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function attemptFromArgs(): Attempt {
  const value = process.argv.find((argument) => argument.startsWith("--attempt="))?.split("=", 2)[1];
  if (value === "allowed-self" || value === "positive-value" || value === "expired-self" || value === "revoked-self" || value === "batch-with-harmful-call") return value;
  throw new Error("Use --attempt=allowed-self, --attempt=positive-value, --attempt=expired-self, --attempt=revoked-self, or --attempt=batch-with-harmful-call.");
}

function safeFailure(error: unknown) {
  if (typeof error !== "object" || error === null) return { type: typeof error };
  const candidate = error as { constructor?: { name?: string }; status?: unknown; code?: unknown };
  return {
    type: candidate.constructor?.name ?? "Error",
    status: typeof candidate.status === "number" ? candidate.status : null,
    code: typeof candidate.code === "string" ? candidate.code : null,
  };
}

const attempt = attemptFromArgs();
if (process.env.POC_CONFIRM_TESTNET_ONLY !== "YES") {
  throw new Error("Set POC_CONFIRM_TESTNET_ONLY=YES after confirming this is a fresh Sepolia-only Privy wallet.");
}

const appId = requireEnvironment("PRIVY_APP_ID");
const appSecret = requireEnvironment("PRIVY_APP_SECRET");
const authorizationPrivateKey = requireEnvironment("PRIVY_AGENT_AUTHORIZATION_PRIVATE_KEY");
const walletId = requireEnvironment("POC_WALLET_ID");
const walletAddress = requireEnvironment("POC_WALLET_ADDRESS");
const harmlessAction = makeHarmlessSelfTransfer(walletAddress);
const action = attempt === "positive-value"
  ? {
      ...harmlessAction,
      params: {
        transaction: { ...harmlessAction.params.transaction, value: "0x1" as const },
      },
    }
  : harmlessAction;

const client = new PrivyClient({ appId, appSecret });
const authorization_context = { authorization_private_keys: [authorizationPrivateKey] };
const idempotency_key = `aquamux-privy-poc-${attempt}-${Date.now()}`;
try {
  const result = attempt === "batch-with-harmful-call"
    ? await client.wallets().ethereum().sendCalls(walletId, {
        caip2: SEPOLIA_CAIP2,
        params: {
          calls: [
            { to: walletAddress, value: "0x0", data: "0x" },
            { to: "0x2222222222222222222222222222222222222222", value: "0x1", data: "0x" },
          ],
        },
        sponsor: false,
        authorization_context,
        idempotency_key,
      })
    : await client.wallets().ethereum().sendTransaction(walletId, {
        ...action,
        authorization_context,
        idempotency_key,
      });

  // No transaction ID, hash, address, or credential is printed or persisted.
  console.log(JSON.stringify({
    attempt,
    caip2: SEPOLIA_CAIP2,
    result: "accepted_by_privy",
    transactionIdPresent: Boolean(result.transaction_id),
    transactionHashPresent: "hash" in result && Boolean(result.hash),
  }));
  if (attempt !== "allowed-self") process.exitCode = 1;
} catch (error) {
  // A reviewer must inspect the redacted API status and the dashboard audit log.
  // This script never treats an arbitrary transport failure as proof of a policy refusal.
  console.log(JSON.stringify({
    attempt,
    caip2: SEPOLIA_CAIP2,
    result: "rejected_or_failed",
    failure: safeFailure(error),
  }));
  if (attempt === "allowed-self") process.exitCode = 1;
}
