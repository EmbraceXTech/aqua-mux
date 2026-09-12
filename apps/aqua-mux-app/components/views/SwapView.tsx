"use client";

import { ArrowUpRight } from "lucide-react";
import { MainLayout } from "@/components/layouts/MainLayout";
import { TradeHeaderActions } from "@/components/managed/trade-header-actions";
import { TradeOverlays } from "@/components/managed/trade-overlays";
import { SwapComposer } from "@/components/swap/swap-composer";
import { SwapDetails } from "@/components/swap/swap-details";
import { SwapFlowPreview } from "@/components/swap/swap-flow-preview";
import { useSwapWorkspace } from "@/hooks/useSwapWorkspace";

export function SwapView() {
  const trade = useSwapWorkspace();

  return (
    <>
      <MainLayout
        activePage="swap"
        actions={<TradeHeaderActions trade={trade} />}
      >
        <div className="intro">
          <h1>
            One token.
            <br className="mobile-break" /> <span>Many possibilities.</span>
          </h1>
          <p>Build your basket with one transaction. You choose the mix.</p>
        </div>
        <div className="workspace">
          <SwapComposer trade={trade} />
          <aside className="sidebar">
            <SwapFlowPreview trade={trade} />
            <SwapDetails trade={trade} />
            <button className="how-link" onClick={() => trade.setHowOpen(true)}>
              New to shared liquidity? See how it works{" "}
              <ArrowUpRight size={13} />
            </button>
          </aside>
        </div>
      </MainLayout>
      <TradeOverlays trade={trade} />
    </>
  );
}
