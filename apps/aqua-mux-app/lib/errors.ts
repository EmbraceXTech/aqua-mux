/** Keep provider transport diagnostics and raw signed transactions out of UI messages. */
export function errorMessage(error: unknown): string {
  const value = error as {
    code?: number;
    shortMessage?: string;
    message?: string;
  } | null;
  if (value?.code === 4001) return "You declined the wallet request.";
  const text =
    value?.shortMessage ??
    value?.message ??
    "The request failed. Please try again.";
  const firstLine = text.split(/\r?\n/).find((line) => line.trim()) ?? "";
  const safe = firstLine
    .replace(/https?:\/\/\S+/gi, "[RPC endpoint]")
    .replace(
      /(?:Request body|Authorization|Bearer|private[_ -]?key)\s*[:=]?.*/gi,
      "",
    )
    .replace(/0x[0-9a-f]{64,}/gi, "[transaction data]")
    .trim();
  return (
    safe.slice(0, 220) ||
    "The wallet request failed. Check your wallet for details."
  );
}
