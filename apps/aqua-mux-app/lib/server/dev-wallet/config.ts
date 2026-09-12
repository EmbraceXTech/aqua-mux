import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import { network } from "../../config";

export const devNetworks = [
  { chainId: 1, name: "Ethereum mainnet", testnet: false },
  { chainId: 56, name: "BNB Chain mainnet", testnet: false },
  { chainId: 42161, name: "Arbitrum One mainnet", testnet: false },
  { chainId: 4663, name: "Robinhood Chain mainnet", testnet: false },
] as const;

export class DevWalletError extends Error {}

export function assertDevMode() {
  if (process.env.NODE_ENV !== "development")
    throw new DevWalletError(
      "Local development wallet is disabled outside development.",
    );
  if (process.env.AQUAMUX_DEV_WALLET === "false")
    throw new DevWalletError(
      "Local development wallet is disabled by server configuration.",
    );
}

export function devWalletMaxFee() {
  const amount = process.env.AQUAMUX_DEV_WALLET_MAX_FEE_WEI;
  if (!amount || !/^[1-9]\d{0,29}$/.test(amount))
    throw new DevWalletError(
      "Configure a positive local wallet maximum fee in wei.",
    );
  return BigInt(amount);
}

function isRpcUrl(value: string | undefined) {
  try {
    const url = new URL(value ?? "");
    return ["http:", "https:"].includes(url.protocol) && !!url.host;
  } catch {
    return false;
  }
}

export function configuredDevNetworks() {
  const missing = devNetworks.filter(
    ({ chainId }) => !isRpcUrl(process.env[network(chainId).env]),
  );
  if (missing.length)
    throw new DevWalletError(
      `Configure valid RPC URLs for the local development wallet: ${missing.map(({ chainId }) => network(chainId).env).join(", ")}.`,
    );
  return devNetworks;
}

export function devAccount() {
  assertDevMode();
  const key = process.env.PRIVATE_KEY?.replace(/^0x/, "");
  if (!key || !/^[0-9a-fA-F]{64}$/.test(key))
    throw new DevWalletError(
      "Configure a valid server-only PRIVATE_KEY for the local development wallet.",
    );
  try {
    return privateKeyToAccount(`0x${key}` as Hex);
  } catch {
    throw new DevWalletError(
      "Configure a valid server-only PRIVATE_KEY for the local development wallet.",
    );
  }
}

export function assertDevChain(chainId: number) {
  if (!devNetworks.some((chain) => chain.chainId === chainId))
    throw new DevWalletError("Unsupported local development wallet chain.");
}

function devWalletOrigin() {
  let origin: URL;
  try {
    origin = new URL(process.env.AQUAMUX_DEV_WALLET_ORIGIN ?? "");
  } catch {
    throw new DevWalletError(
      "Configure the exact local development wallet origin.",
    );
  }
  if (
    !["127.0.0.1", "[::1]", "localhost"].includes(origin.hostname) ||
    !["http:", "https:"].includes(origin.protocol) ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  )
    throw new DevWalletError(
      "Configure the exact local development wallet origin.",
    );
  const authOrigin = process.env.AQUAMUX_AUTH_ORIGIN ?? "http://127.0.0.1:3100";
  if (authOrigin !== origin.origin)
    throw new DevWalletError(
      "Configure AQUAMUX_AUTH_ORIGIN to match the local development wallet origin.",
    );
  return origin;
}

export function developmentWalletAvailability() {
  try {
    assertDevMode();
    devAccount();
    devWalletMaxFee();
    configuredDevNetworks();
    devWalletOrigin();
    return { available: true };
  } catch (error) {
    return {
      available: false,
      error:
        error instanceof DevWalletError
          ? error.message
          : "Local development wallet configuration could not be checked.",
    };
  }
}

// A loopback-bound Next server is mandatory. Never publish this server through a proxy.
export function assertLocalRequest(request: Request) {
  assertDevMode();
  const origin = devWalletOrigin();
  const url = new URL(request.url);
  const checks = {
    configuration: true,
    // Next reconstructs internal URLs with its bind hostname. Host and Origin
    // below must still exactly match the configured browser origin.
    url:
      url.origin === origin.origin ||
      (["127.0.0.1", "[::1]", "localhost"].includes(url.hostname) &&
        url.protocol === origin.protocol &&
        url.port === origin.port &&
        !url.username &&
        !url.password),
    origin: request.headers.get("origin") === origin.origin,
    host: request.headers.get("host") === origin.host,
    forwarded:
      !request.headers.has("forwarded") &&
      (!request.headers.has("x-forwarded-host") ||
        request.headers.get("x-forwarded-host") === origin.host),
    peer: !(request.headers.get("x-forwarded-for") ?? "")
      .split(",")
      .some(
        (ip) =>
          ip.trim() &&
          !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(ip.trim()),
      ),
    site: [null, "same-origin"].includes(request.headers.get("sec-fetch-site")),
    intent: request.headers.get("x-aquamux-dev-wallet") === "manual",
    json: !!request.headers.get("content-type")?.startsWith("application/json"),
  };
  const failed = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  if (failed.length)
    throw new DevWalletError(
      `Local development wallet requires a same-origin loopback request (${failed.join(", ")}).`,
    );
}
