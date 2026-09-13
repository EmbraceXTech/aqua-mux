import type { PortfolioAsset as Asset } from "@/types/portfolio";
import { network } from "@/lib/config";
import { ArrowUpRight } from "lucide-react";
import { amountLabel } from "@/lib/utils/portfolio";
import { AssetMark } from "./asset-mark";
import s from "./portfolio.module.css";

type Props = {
  assets: Asset[];
  initialLoading: boolean;
  hasFilters: boolean;
  hasError: boolean;
  onSelectAsset: (asset: Asset) => void;
  onClearFilters: () => void;
};
export function PortfolioAssets({
  assets,
  initialLoading,
  hasFilters,
  hasError,
  onSelectAsset,
  onClearFilters,
}: Props) {
  return (
    <>
      <table>
        <thead>
          <tr>
            <th>Asset</th>
            <th>Price</th>
            <th>24h change</th>
            <th>7D trend</th>
            <th>Balance</th>
            <th>Value</th>
            <th>
              <span className={s.srOnly}>Details</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {assets.map((asset) => (
            <tr key={`${asset.chainId}:${asset.address}`}>
              <td>
                <div className={s.asset}>
                  <AssetMark asset={asset} />
                  <div>
                    <strong>
                      {asset.name}
                      <span>{asset.symbol}</span>
                    </strong>
                    <small>
                      <i
                        className={s.ethDot}
                        style={{
                          background: network(asset.chainId).color,
                        }}
                      />
                      {network(asset.chainId).name}
                    </small>
                  </div>
                </div>
              </td>
              <td>N/A</td>
              <td>N/A</td>
              <td>N/A</td>
              <td title={asset.balance}>
                {amountLabel(asset.balance)}
                <small className={s.balanceSymbol}>{asset.symbol}</small>
              </td>
              <td className={s.assetValue}>N/A</td>
              <td>
                <button
                  className={s.iconButton}
                  aria-label={`View ${asset.name} details on ${network(asset.chainId).name}`}
                  onClick={() => onSelectAsset(asset)}
                >
                  <ArrowUpRight size={17} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {initialLoading && (
        <div className={s.empty} role="status">
          Reading wallet balances…
        </div>
      )}
      {!initialLoading && !assets.length && (
        <div className={s.empty}>
          {hasFilters
            ? "No assets match your filters."
            : hasError
              ? "No balances available. Retry the failed networks above."
              : "No non-zero supported asset balances found."}
          {hasFilters && (
            <button onClick={onClearFilters}>Clear filters</button>
          )}
        </div>
      )}
    </>
  );
}
