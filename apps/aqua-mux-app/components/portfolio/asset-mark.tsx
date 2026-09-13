import type { PortfolioAsset as Asset } from "@/types/portfolio";
import { network } from "@/lib/config";

import s from "./portfolio.module.css";

export function AssetMark({ asset }: { asset: Asset }) {
  return (
    <span
      className={s.token}
      style={{ background: network(asset.chainId).color, fontSize: 14 }}
    >
      {asset.symbol.slice(0, 2)}
    </span>
  );
}
