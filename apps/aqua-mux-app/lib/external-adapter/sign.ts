import type { Hex } from "viem";
import type { Provider } from "../wallet";
import type { ExternalTransaction } from "../server/external-adapter/types";
export type { ExternalTransaction } from "../server/external-adapter/types";

/** The provider signs only; the backend rechecks the exact envelope before broadcasting. */
export async function signExternalTransaction(
  provider: Provider,
  transaction: ExternalTransaction,
  expiresAt: number,
  assertCurrent: () => void,
): Promise<Hex> {
  assertCurrent();
  const accounts = await provider.request({ method: "eth_accounts" });
  const chainId = await provider.request({ method: "eth_chainId" });
  if (
    !Array.isArray(accounts) ||
    String(accounts[0]).toLowerCase() !== transaction.from ||
    chainId !== transaction.chainId
  )
    throw new Error("The wallet account or chain changed before signing.");
  assertCurrent();
  if (Date.now() >= expiresAt)
    throw new Error("The reviewed transaction expired before signing.");
  const result = await provider.request({
    method: "eth_signTransaction",
    params: [transaction],
  });
  if (typeof result !== "string" || !/^0x02[0-9a-fA-F]+$/.test(result))
    throw new Error(
      "The wallet did not return a signed transaction. Keep this attempt unresolved until wallet activity is checked.",
    );
  // A late signed result must reach the server, which refuses expired execution and retains the attempt.
  return result as Hex;
}
