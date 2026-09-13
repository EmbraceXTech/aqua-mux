import type { PortfolioAsset as Asset } from "@/types/portfolio";
import { network } from "@/lib/config";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import s from "./portfolio.module.css";

type Props = {
  assets: Asset[];
  countLabel: string;
  initialLoading: boolean;
  onSelectAsset: (asset: Asset) => void;
  onViewAssets: () => void;
};
export function PortfolioAllocation({
  assets,
  countLabel,
  initialLoading,
  onSelectAsset,
  onViewAssets,
}: Props) {
  const networkCount = new Set(assets.map((asset) => asset.chainId)).size;
  return (
    <section className={`${s.card} ${s.allocation}`}>
      <div className={s.cardTop}>
        <h2>Asset allocation</h2>
        <span className={s.count}>{countLabel}</span>
      </div>
      <div className={s.donut} style={{ background: "#edf0f5" }}>
        <div>
          <span>Supported holdings on</span>
          <strong>{networkCount} networks</strong>
          <span>USD allocation unavailable</span>
        </div>
      </div>
      <div className={s.legend}>
        {assets.slice(0, 4).map((asset) => (
          <button
            key={`${asset.chainId}:${asset.address}`}
            onClick={() => onSelectAsset(asset)}
          >
            <span>
              <i style={{ background: network(asset.chainId).color }} />
              {asset.symbol}
            </span>
            <span>
              {network(asset.chainId).name}
              <ArrowUpRight size={12} />
            </span>
          </button>
        ))}
        {!assets.length && (
          <span className={s.allocationEmpty}>
            {initialLoading
              ? "Reading supported balances…"
              : "No supported holdings to display"}
          </span>
        )}
        {assets.length > 4 && (
          <button onClick={onViewAssets}>
            View all {assets.length} assets <ArrowRight size={12} />
          </button>
        )}
      </div>
    </section>
  );
}
