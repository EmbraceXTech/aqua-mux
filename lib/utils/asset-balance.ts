import { formatUnits, type Address } from "viem";
import type { AssetBalance } from "../types/network.ts";

export function assetBalance(
  symbol: string,
  value: bigint,
  decimals: number,
  address?: Address,
): AssetBalance {
  return {
    symbol,
    value,
    decimals,
    formatted: formatUnits(value, decimals),
    address,
  };
}
