"use client";

import { useId, useRef, useState, type Ref } from "react";
import { Search, ShieldCheck } from "lucide-react";
import { networks } from "@/lib/config";
import type { PortfolioAsset, RecordedPosition } from "@/types/portfolio";
import { PortfolioAssets } from "./portfolio-assets";
import { PortfolioPositions } from "./portfolio-positions";
import { PortfolioActivity } from "./portfolio-activity";
import s from "./portfolio.module.css";

const tabs = ["Assets", "Liquidity positions", "Activity"] as const;
export type PortfolioTab = (typeof tabs)[number];

type Props = {
  owner?: string;
  busy: boolean;
  assets: PortfolioAsset[];
  positions: RecordedPosition[];
  initialLoading: boolean;
  balancesError: boolean;
  positionsLoading: boolean;
  positionsError: boolean;
  tab: PortfolioTab;
  panelRef: Ref<HTMLDivElement>;
  onTabChange: (tab: PortfolioTab) => void;
  onConnect: () => void;
  onSelectAsset: (asset: PortfolioAsset) => void;
  onRetryPositions: () => void;
};

export function PortfolioHoldings({
  owner,
  busy,
  assets,
  positions,
  initialLoading,
  balancesError,
  positionsLoading,
  positionsError,
  tab,
  panelRef,
  onTabChange,
  onConnect,
  onSelectAsset,
  onRetryPositions,
}: Props) {
  const [query, setQuery] = useState("");
  const [chain, setChain] = useState("all");
  const id = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredAssets = assets.filter(
    (asset) =>
      (chain === "all" || String(asset.chainId) === chain) &&
      `${asset.name} ${asset.symbol} ${asset.address}`
        .toLowerCase()
        .includes(normalizedQuery),
  );
  const filteredPositions = positions.filter(
    (position) => chain === "all" || String(position.chainId) === chain,
  );
  function clearFilters() {
    setQuery("");
    setChain("all");
  }
  function renderPanel() {
    if (!owner)
      return (
        <div className={s.empty}>
          Connect a wallet to view your portfolio.
          <button disabled={busy} onClick={onConnect}>
            {busy ? "Waiting for wallet" : "Connect wallet"}
          </button>
        </div>
      );
    switch (tab) {
      case "Assets":
        return (
          <PortfolioAssets
            assets={filteredAssets}
            initialLoading={initialLoading}
            hasFilters={!!query || chain !== "all"}
            hasError={balancesError}
            onSelectAsset={onSelectAsset}
            onClearFilters={clearFilters}
          />
        );
      case "Liquidity positions":
        return (
          <PortfolioPositions
            positions={filteredPositions}
            loading={positionsLoading}
            error={positionsError}
            hasFilters={chain !== "all"}
            onRetry={onRetryPositions}
            onClearFilters={() => setChain("all")}
          />
        );
      case "Activity":
        return <PortfolioActivity owner={owner} />;
    }
  }
  return (
    <section className={`${s.card} ${s.holdings}`}>
      <div className={s.holdingsHeader}>
        <div className={s.tabs} role="tablist" aria-label="Portfolio holdings">
          {tabs.map((item, index) => (
            <button
              key={item}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              role="tab"
              id={`${id}-tab-${index}`}
              aria-controls={`${id}-panel`}
              aria-selected={tab === item}
              tabIndex={tab === item ? 0 : -1}
              onKeyDown={(event) => {
                let next: number;
                switch (event.key) {
                  case "ArrowRight":
                    next = (index + 1) % tabs.length;
                    break;
                  case "ArrowLeft":
                    next = (index + tabs.length - 1) % tabs.length;
                    break;
                  case "Home":
                    next = 0;
                    break;
                  case "End":
                    next = tabs.length - 1;
                    break;
                  default:
                    return;
                }
                event.preventDefault();
                onTabChange(tabs[next]);
                tabRefs.current[next]?.focus();
              }}
              onClick={() => onTabChange(item)}
              className={tab === item ? s.activeTab : ""}
            >
              {item}
              {item !== "Activity" && (
                <span>
                  {item === "Assets" ? assets.length : positions.length}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className={s.filters}>
          {tab === "Assets" && (
            <label className={s.search}>
              <Search size={14} />
              <input
                aria-label="Search assets"
                placeholder="Search assets"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          )}
          {tab !== "Activity" && (
            <select
              aria-label="Filter network"
              value={chain}
              onChange={(event) => setChain(event.target.value)}
            >
              <option value="all">All networks</option>
              {networks.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
      <div
        ref={panelRef}
        id={`${id}-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-tab-${tabs.indexOf(tab)}`}
        className={s.tableWrap}
        tabIndex={0}
      >
        {renderPanel()}
      </div>
      <div className={s.tableFooter}>
        <span>
          <ShieldCheck size={14} />
          Your assets stay in your wallet. Always.
        </span>
        <span>
          {tab === "Assets"
            ? `${filteredAssets.length} supported assets`
            : tab === "Liquidity positions"
              ? `${filteredPositions.length} recorded positions`
              : "Network explorers"}
        </span>
      </div>
    </section>
  );
}
