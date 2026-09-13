"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { useLiveSwap } from "./useLiveSwap";
import { SWAP_CHAIN, type LiveQuote, type Side } from "@/lib/live-swap";
import {
  createSwapDraftState,
  isValidSlippage,
  swapDraftReducer,
  type SwapDraftAction,
  type TokenPickerTarget,
} from "@/lib/swap-draft";

type SwapDialog =
  | { type: "tokens"; target: TokenPickerTarget }
  | { type: "slippage" }
  | { type: "review"; quote: LiveQuote; account: string };

// Draft editing and dialog transitions live here. Quotes and wallet execution
// remain in useLiveSwap, so presentational components never request signatures.
export function useSwapWorkspace() {
  const [state, dispatch] = useReducer(
    swapDraftReducer,
    undefined,
    createSwapDraftState,
  );
  const [dialog, setDialog] = useState<SwapDialog | null>(null);
  const [toast, setToast] = useState<string[] | null>(null);
  const dialogOpener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);
  const draft = state.drafts[state.mode];
  const validSlippage = isValidSlippage(state.slippage);
  const request = {
    chainId: SWAP_CHAIN,
    mode: state.mode,
    draft,
    slippageBps: validSlippage ? Math.round(Number(state.slippage) * 100) : 0,
  } as const;
  const trade = useLiveSwap(request);
  const locked = trade.busy || !!trade.pending || trade.unknown;
  const canReview =
    trade.fresh &&
    !trade.quoteBusy &&
    !locked &&
    !trade.insufficient.length &&
    trade.walletChain === SWAP_CHAIN;
  const reviewValid =
    dialog?.type === "review" &&
    dialog.account === trade.account &&
    JSON.stringify(dialog.quote.request) === JSON.stringify(request) &&
    trade.clock > 0 &&
    dialog.quote.expiresAt > trade.clock;

  function openDialog(next: SwapDialog) {
    if (locked) return;
    dialogOpener.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setDialog(next);
  }
  function edit(action: SwapDraftAction) {
    if (locked) return;
    setToast(null);
    dispatch(action);
    // Slippage is controlled in its open dialog; other edits dismiss overlays.
    if (action.type !== "slippage") setDialog(null);
  }
  function setExact(side: Side) {
    edit({
      type: "exact",
      side,
      amounts: trade.fresh ? trade.quote?.amounts : undefined,
    });
  }
  function closeDialog() {
    if (!trade.busy) setDialog(null);
  }
  function refresh() {
    if (locked) return;
    setToast(null);
    setDialog(null);
    trade.refresh();
  }
  function openReview() {
    if (locked) return;
    const errors = !validSlippage
      ? ["Enter slippage from 0.01% to 5%."]
      : trade.quoteError
        ? [trade.quoteError]
        : trade.insufficient.length
          ? trade.insufficient
          : !trade.quote
            ? ["Enter valid amounts, then wait for a quote."]
            : !trade.fresh
              ? ["Quote expired. Refresh to continue."]
              : [];
    if (errors.length) {
      setToast(errors);
      return;
    }
    if (canReview && trade.quote && trade.account)
      openDialog({
        type: "review",
        quote: trade.quote,
        account: trade.account,
      });
  }
  async function submit(
    approval?: ReturnType<typeof trade.approvalsFor>[number],
  ) {
    if (dialog?.type !== "review" || !reviewValid || locked) return;
    if (await trade.send(dialog.quote, approval)) setDialog(null);
  }
  return {
    mode: state.mode,
    slippage: state.slippage,
    draft,
    validSlippage,
    trade,
    multi: (state.mode === "multi-in" ? "input" : "output") as Side,
    singleSwap: draft.input.length === 1 && draft.output.length === 1,
    locked,
    canReview,
    dialog,
    toast,
    dismissToast: () => setToast(null),
    restoreDialogFocus: () => {
      const opener = dialogOpener.current;
      // Token replacement remounts a keyed row; restore the same field slot.
      return opener?.id ? document.getElementById(opener.id) : opener;
    },
    reviewValid,
    edit,
    setExact,
    closeDialog,
    refresh,
    openReview,
    submit,
    openPicker: (target: TokenPickerTarget) => {
      openDialog({ type: "tokens", target });
    },
    openSettings: () => {
      openDialog({ type: "slippage" });
    },
  };
}
export type SwapWorkspace = ReturnType<typeof useSwapWorkspace>;
