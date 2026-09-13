import { TokenImage } from "@/components/token-image";
import type { PortfolioAsset as Asset } from "@/types/portfolio";
import s from "./portfolio.module.css";

export function AssetMark({ asset }: { asset: Asset }) {
  return (
    <TokenImage
      className={s.token}
      logo={asset.logo}
      symbol={asset.symbol}
      size={34}
      alt=""
    />
  );
}
