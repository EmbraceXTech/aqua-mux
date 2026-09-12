import type { Address } from "viem";
import type {
  WalletExecutionStatus,
  WalletMode,
} from "@/lib/managed-client/wallet-execution";

export type Leg = { address: Address; bps: number; amount: string };

export type TransactionRecord = {
  id: string;
  chainId: number;
  account: Address;
  mode: string;
  walletMode: WalletMode;
  submittedAt: number;
  read: boolean;
  status?: WalletExecutionStatus;
};

export type Health = {
  networks: {
    id: number;
    online: boolean;
    aqua: boolean;
    swapVm: boolean;
    block?: string;
  }[];
  swapApiConfigured: boolean;
};
