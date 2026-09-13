import { networks, tokens } from "@/lib/config";

export function logoForTokenSymbol(symbol: string): string | undefined {
  const normalizedSymbol = symbol.trim().toUpperCase();
  if (!normalizedSymbol) return;

  for (const chain of networks) {
    const logo = tokens(chain.id).find(
      (token) =>
        token.symbol.trim().toUpperCase() === normalizedSymbol &&
        token.logo.trim(),
    )?.logo.trim();
    if (logo) return logo;
  }
}
