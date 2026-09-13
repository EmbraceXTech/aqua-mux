import { Modal } from "@/components/ui/modal";
import type { SwapWorkspace } from "@/hooks/useSwapWorkspace";
import { SwapReviewDialog } from "./swap-review-dialog";
import { SwapSlippageDialog } from "./swap-slippage-dialog";
import { SwapTokenPicker } from "./swap-token-picker";

export function SwapDialogs({ workspace: w }: { workspace: SwapWorkspace }) {
  const dialog = w.dialog;
  const title =
    dialog?.type === "tokens"
      ? `Select ${dialog.target.side} token`
      : dialog?.type === "slippage"
        ? "Slippage"
        : "Review your swap";
  const description =
    dialog?.type === "tokens"
      ? "Verified Arbitrum token addresses. Pool availability depends on the fee tier."
      : dialog?.type === "slippage"
        ? "A minimum receive or maximum spend limit for every swap leg."
        : "Real transaction on Arbitrum One, chain ID 42161. Confirm each action in your wallet.";
  // Keep the dialog root mounted so Base UI can restore focus to its opener.
  // Only the content mounts per session, resetting transient picker search.
  return (
    <Modal
      open={!!dialog}
      finalFocus={w.restoreDialogFocus}
      title={title}
      description={description}
      onOpenChange={(open) => {
        if (!open) w.closeDialog();
      }}
    >
      {dialog?.type === "tokens" && (
        <SwapTokenPicker
          draft={w.draft}
          locked={w.locked}
          balances={w.trade.holdings}
          onPick={(symbol) =>
            w.edit({ type: "token", target: dialog.target, symbol })
          }
        />
      )}
      {dialog?.type === "slippage" && (
        <SwapSlippageDialog
          value={w.slippage}
          multi={w.multi}
          locked={w.locked}
          onChange={(value) => w.edit({ type: "slippage", value })}
          onClose={w.closeDialog}
        />
      )}
      {dialog?.type === "review" && (
        <SwapReviewDialog
          quote={dialog.quote}
          account={dialog.account}
          valid={w.reviewValid}
          locked={w.locked}
          trade={w.trade}
          onSubmit={w.submit}
          onRefresh={w.refresh}
          onClose={w.closeDialog}
        />
      )}
    </Modal>
  );
}
