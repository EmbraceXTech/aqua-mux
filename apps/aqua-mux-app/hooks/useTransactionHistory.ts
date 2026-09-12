import { useEffect, useState } from "react";
import { network } from "@/lib/config";
import { storedExecutionStatus } from "@/lib/utils/swap";
import type { TransactionRecord } from "@/types/swap";

type UseTransactionHistoryOptions = {
  onInitialTransaction: (transaction: TransactionRecord) => void;
};

export function useTransactionHistory({
  onInitialTransaction,
}: UseTransactionHistoryOptions) {
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const saved = sessionStorage.getItem("aquamux:transactions");
        const legacy = sessionStorage.getItem("aquamux:last-batch");
        const parsed = saved
          ? JSON.parse(saved)
          : legacy
            ? [JSON.parse(legacy)]
            : [];
        const valid = (Array.isArray(parsed) ? parsed : [])
          .filter((item) => {
            try {
              network(item.chainId);
              return (
                typeof item.id === "string" &&
                /^0x[0-9a-fA-F]{40}$/.test(item.account)
              );
            } catch {
              return false;
            }
          })
          .slice(0, 10)
          .map((item) => ({
            ...item,
            walletMode:
              item.walletMode === "local-development"
                ? "local-development"
                : "external",
            submittedAt: item.submittedAt || Date.now(),
            read: item.read ?? true,
            status: storedExecutionStatus(item.status),
          })) as TransactionRecord[];
        setTransactions(valid);
        if (valid[0]) onInitialTransaction(valid[0]);
      } catch {
        /* Storage may be unavailable in private browser contexts. */
      } finally {
        setLoaded(true);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [onInitialTransaction]);

  useEffect(() => {
    if (!loaded) return;
    try {
      sessionStorage.setItem(
        "aquamux:transactions",
        JSON.stringify(transactions),
      );
    } catch {
      /* The wallet still retains its activity. */
    }
  }, [loaded, transactions]);

  return { loaded, setTransactions, transactions };
}
