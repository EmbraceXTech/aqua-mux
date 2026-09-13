"use client";

import { useRef, useState } from "react";
import { MainLayout } from "@/components/layouts/MainLayout";
import { useManagedSession } from "@/lib/managed-client/use-managed-session";
import { selectedChainId } from "@/lib/selected-chain";
import { usePortfolio } from "@/hooks/usePortfolio";
import { downloadPortfolio } from "@/lib/utils/portfolio-export";
import type { PortfolioAsset } from "@/types/portfolio";
import { AssetDetails } from "@/components/portfolio/asset-details";
import { PortfolioHeading } from "@/components/portfolio/portfolio-heading";
import { PortfolioNotices } from "@/components/portfolio/portfolio-notices";
import { PortfolioPerformance } from "@/components/portfolio/portfolio-performance";
import { PortfolioAllocation } from "@/components/portfolio/portfolio-allocation";
import { PortfolioStats } from "@/components/portfolio/portfolio-stats";
import {
  PortfolioHoldings,
  type PortfolioTab,
} from "@/components/portfolio/portfolio-holdings";
import { PortfolioFooter } from "@/components/portfolio/portfolio-footer";
import s from "@/components/portfolio/portfolio.module.css";

export function PortfolioView() {
  const wallet = useManagedSession(selectedChainId());
  const session = wallet.session;
  const portfolio = usePortfolio(session);
  const [tab, setTab] = useState<PortfolioTab>("Assets");
  const [selection, setSelection] = useState<{
    key: string;
    sessionId: string;
  } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Store identity, not a balance snapshot, so refreshes update the open dialog.
  const selected =
    selection?.sessionId === session?.sessionId
      ? portfolio.assets.find(
          (asset) => `${asset.chainId}:${asset.address}` === selection?.key,
        )
      : undefined;
  const countLabel = !session
    ? "Connect wallet"
    : portfolio.initialLoading
      ? "Loading"
      : `${portfolio.assets.length} assets`;
  function selectAsset(asset: PortfolioAsset) {
    if (session)
      setSelection({
        key: `${asset.chainId}:${asset.address}`,
        sessionId: session.sessionId,
      });
  }
  function viewAssets() {
    setTab("Assets");
    panelRef.current?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }
  return (
    <MainLayout activePage="portfolio">
      <div className={s.root}>
        <div className={s.main}>
        <PortfolioHeading
          connected={!!session}
          loading={portfolio.loading}
          canExport={
            !!session &&
            !portfolio.loading &&
            !!(portfolio.assets.length || portfolio.positions.length)
          }
          onRefresh={portfolio.refresh}
          onExport={() =>
            downloadPortfolio(portfolio.assets, portfolio.positions)
          }
        />
        <PortfolioNotices
          error={wallet.error}
          connected={!!session}
          loading={portfolio.loading}
          failedNetworks={portfolio.failedNetworks}
          missingBalances={portfolio.missingBalances}
          onRetry={portfolio.refresh}
        />
        <div className={s.overview}>
          <PortfolioPerformance
            connected={!!session}
            loading={portfolio.loading}
          />
          <PortfolioAllocation
            assets={portfolio.assets}
            countLabel={countLabel}
            initialLoading={portfolio.initialLoading}
            onSelectAsset={selectAsset}
            onViewAssets={viewAssets}
          />
        </div>
        <PortfolioStats
          countLabel={countLabel}
          activePositions={
            portfolio.positions.filter(
              (position) => position.state === "active",
            ).length
          }
        />
        <PortfolioHoldings
          owner={session?.owner}
          busy={wallet.busy}
          assets={portfolio.assets}
          positions={portfolio.positions}
          initialLoading={portfolio.initialLoading}
          balancesError={portfolio.failedNetworks.length > 0}
          positionsLoading={portfolio.positionsLoading}
          positionsError={portfolio.positionsError}
          tab={tab}
          panelRef={panelRef}
          onTabChange={setTab}
          onConnect={() => void wallet.connect("external")}
          onSelectAsset={selectAsset}
          onRetryPositions={portfolio.retryPositions}
        />
        <PortfolioFooter />
        </div>
      </div>
      {selected && (
        <AssetDetails
          key={`${selected.chainId}:${selected.address}`}
          asset={selected}
          onClose={() => setSelection(null)}
        />
      )}
    </MainLayout>
  );
}
