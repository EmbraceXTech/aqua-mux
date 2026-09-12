"use client";

import { ArrowUpRight } from "lucide-react";
import { MainLayout } from "@/components/layouts/MainLayout";
import { TradeHeaderActions } from "@/components/managed/trade-header-actions";
import { TradeOverlays } from "@/components/managed/trade-overlays";
import { LiquidityComposer } from "@/components/liquidity/liquidity-composer";
import { LiquidityPriceRangeControl } from "@/components/liquidity/liquidity-price-range-control";
import { useLPWorkspace } from "@/hooks/useLPWorkspace";

export function LPView() {
  const trade = useLPWorkspace();

  return (
    <>
      <MainLayout
        activePage="liquidity"
        actions={<TradeHeaderActions trade={trade} />}
      >
        <div className="intro">
          <h1>
            One token.
            <br className="mobile-break" /> <span>Many possibilities.</span>
          </h1>
          <p>
            One shared balance. Multiple pairs. Liquidity that stays in your
            wallet.
          </p>
        </div>
        <div className="workspace">
          <LiquidityComposer trade={trade} />
          <aside className="sidebar">
            <LiquidityPriceRangeControl trade={trade} />
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
