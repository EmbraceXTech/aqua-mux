import type { Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export function walletAddress(value: string): Address {
  if (/^0x[0-9a-fA-F]{40}$/.test(value)) return value as Address;

  const privateKey = value.replace(/^0x/, "");
  if (!/^[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error(
      "The value is not an Ethereum private key or wallet address.",
    );
  }

  try {
    return privateKeyToAccount(`0x${privateKey}`).address;
  } catch {
    throw new Error("The value is not a valid Ethereum private key.");
  }
}
