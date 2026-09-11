import { erc20Abi, type PublicClient } from "viem";
import { NATIVE, token, wrapped } from "../../config";
import { tokenSchema, type Token } from "../../managed/primitives";
import type { LifecycleRequest } from "./types";

export function requestTokens(request: LifecycleRequest): Token[] {
  const chainId = request.config.chainId;
  const initial = [token(chainId, NATIVE), wrapped(chainId)].map(
    ({ address, decimals, symbol }) => ({ address, decimals, symbol }),
  );
  const candidates = [
    ...initial,
    ...request.inventory.map((i) => i.token),
    ...request.config.pairs.flatMap((p) => [p.baseToken, p.quoteToken]),
    ...(request.funding
      ? [
          request.funding.token,
          ...request.funding.purchases.map((p) => p.token),
        ]
      : []),
    ...(request.conversion
      ? [
          request.conversion.targetToken,
          ...request.conversion.amounts.map((p) => p.token),
        ]
      : []),
  ];
  const unique = new Map<string, Token>();
  for (const input of candidates) {
    const t = tokenSchema.parse(input),
      previous = unique.get(t.address);
    if (
      previous &&
      (previous.decimals !== t.decimals || previous.symbol !== t.symbol)
    )
      throw new Error("Conflicting token metadata in lifecycle request.");
    unique.set(t.address, t);
  }
  return [...unique.values()];
}

/** Registry selection is checked by the API; the lifecycle checks actual code and decimals again. */
export async function verifyLifecycleToken(
  t: Token,
  rpc: Pick<PublicClient, "getCode" | "readContract">,
  blockNumber: bigint,
) {
  if (t.address === NATIVE) {
    if (t.decimals !== 18) throw new Error("Native decimals mismatch.");
    return;
  }
  const code = await rpc.getCode({ address: t.address, blockNumber });
  if (!code || code === "0x")
    throw new Error("Selected token has no contract code.");
  const decimals = await rpc.readContract({
    address: t.address,
    abi: erc20Abi,
    functionName: "decimals",
    blockNumber,
  });
  if (decimals !== t.decimals)
    throw new Error(
      "Selected token decimals differ from the current contract.",
    );
}
