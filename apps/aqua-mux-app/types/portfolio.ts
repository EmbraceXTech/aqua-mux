import type { ChainId, Token } from "@/lib/config";
import type { StrategyGroup, Token as ManagedToken } from "@/lib/managed";
import type { ManagedSession } from "@/lib/managed-client/api";

export type PortfolioAsset = Token & { chainId: ChainId; balance: string };

export type Balances = Record<string, string | null>;

export type RecordedPosition = {
  id: string;
  groupId: string;
  chainId: number;
  state: "pending" | "active" | "docked" | "unknown";
  groupState: StrategyGroup["state"];
  registrationBlock: string | null;
  tokens: ManagedToken[];
  range: string;
  feeBps: number | null;
};

export type PortfolioHeaderActionsProps = {
  session?: ManagedSession;
  busy: boolean;
  localWalletAvailable: boolean;
  onConnect: (mode: ManagedSession["mode"]) => void;
  onDisconnect: () => void;
};

export type WalletBalanceQuery = {
  account: string;
  chainId: ChainId;
};
