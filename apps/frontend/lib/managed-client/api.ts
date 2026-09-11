import { stringToHex, type Address } from "viem";
import type {
  BotRun,
  LifecyclePlan,
  Records,
  StrategyGroup,
} from "@/lib/managed";
import { connectWallet } from "@/lib/wallet";

export type ManagedSession = {
  token: string;
  owner: Address;
  sessionId: string;
  expiresAt: number;
  mode: "external" | "local-development";
};
export type GroupDetail = {
  group: StrategyGroup;
  bot: BotRun;
  reviews?: Records["review"][];
  plans?: LifecyclePlan[];
  strategies?: Records["strategy"][];
  transactions?: Records["transaction"][];
  movements?: Records["movement"][];
  payments?: Records["payment"][];
};

export class ManagedRequestError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export async function managedRequest<T>(
  path: string,
  session?: ManagedSession,
  body?: unknown,
  method?: "PATCH",
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(
    path.startsWith("/api/") ? path : `/api/managed${path}`,
    {
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers: {
        ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: "no-store",
      signal,
    },
  );
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new ManagedRequestError(
      typeof data?.error === "string"
        ? data.error
        : `Request failed (${response.status}). Refresh before retrying.`,
      data?.code,
      response.status,
    );
  if (data === null)
    throw new ManagedRequestError(
      "The server returned an unreadable response. Refresh before retrying.",
    );
  return data as T;
}

export async function authenticateWallet(
  chainId: number,
): Promise<ManagedSession> {
  const owner = await connectWallet();
  const challenge = await managedRequest<{ id: string; message: string }>(
    "/api/auth/challenge",
    undefined,
    { owner, chainId },
  );
  const signature = await window.ethereum!.request({
    method: "personal_sign",
    params: [stringToHex(challenge.message), owner],
  });
  const session = await managedRequest<Omit<ManagedSession, "mode">>(
    "/api/auth/verify",
    undefined,
    { id: challenge.id, signature },
  );
  return { ...session, mode: "external" };
}

export const requestKey = () => crypto.randomUUID();
