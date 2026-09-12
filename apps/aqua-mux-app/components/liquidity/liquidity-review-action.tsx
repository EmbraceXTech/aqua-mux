import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TradeWorkspace } from "@/hooks/useTradeWorkspace";
import { transactionState } from "@/lib/utils/swap";

export function LiquidityReviewAction({ trade }: { trade: TradeWorkspace }) {
  const {
    account,
    amount,
    blocked,
    busy,
    reviewPlan,
    total,
    unresolvedTransaction,
  } = trade;

  return (
    <Button
      className="main-action"
      onClick={reviewPlan}
      disabled={
        busy || blocked || total !== 10000 || !amount || Number(amount) <= 0
      }
    >
      {busy ? (
        <>
          <Loader2 size={18} className="spin" />
          Preparing transaction
        </>
      ) : blocked ? (
        transactionState(unresolvedTransaction?.status) === "unknown" ? (
          "Check unresolved transaction"
        ) : (
          "Transaction pending"
        )
      ) : account ? (
        "Review liquidity positions"
      ) : (
        "Connect wallet"
      )}
      {!busy && !blocked && <ArrowRight size={17} />}
    </Button>
  );
}
