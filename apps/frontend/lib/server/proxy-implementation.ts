import type { Address, Hex } from "viem";
export const implementationSlot =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

// Circle FiatTokenProxy retains the original ZeppelinOS storage convention.
// https://github.com/circlefin/stablecoin-evm/blob/master/contracts/upgradeability/UpgradeabilityProxy.sol
export const proxyImplementationSlots = [
  implementationSlot,
  "0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3",
] as const;

export function implementationFromSlots(
  values: readonly (Hex | undefined)[],
): Address | undefined {
  const addresses = new Set<Address>();
  for (const value of values) {
    if (value === undefined) continue;
    if (!/^0x[0-9a-fA-F]{1,64}$/.test(value) || BigInt(value) >= 1n << 160n)
      throw new Error("Invalid proxy implementation slot.");
    if (BigInt(value) !== 0n)
      addresses.add(`0x${BigInt(value).toString(16).padStart(40, "0")}`);
  }
  if (addresses.size > 1)
    throw new Error("Conflicting proxy implementation slots.");
  return [...addresses][0];
}

export async function readProxyImplementation(
  rpc: {
    getStorageAt(args: {
      address: Address;
      slot: Hex;
      blockNumber?: bigint;
    }): Promise<Hex | undefined>;
  },
  address: Address,
  blockNumber?: bigint,
) {
  const values = await Promise.all(
    proxyImplementationSlots.map((slot) =>
      rpc.getStorageAt({ address, slot, blockNumber }),
    ),
  );
  if (values.some((value) => value === undefined))
    throw new Error("Proxy storage could not be verified.");
  return implementationFromSlots(values);
}
