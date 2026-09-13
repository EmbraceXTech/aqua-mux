import { networks, type ChainId } from "./config";

const storageKey = "aquamux-selected-chain";
const defaultChainId: ChainId = 42161;

export function selectedChainId(): ChainId {
  if (typeof window === "undefined") return defaultChainId;

  const value = Number(window.localStorage.getItem(storageKey));
  return networks.some((network) => network.id === value)
    ? (value as ChainId)
    : defaultChainId;
}

export function saveSelectedChainId(chainId: ChainId) {
  window.localStorage.setItem(storageKey, String(chainId));
}
