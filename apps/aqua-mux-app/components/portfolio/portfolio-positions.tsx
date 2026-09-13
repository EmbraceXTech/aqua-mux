import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { network } from "@/lib/config";
import { positionStateLabel } from "@/lib/utils/portfolio";
import type { RecordedPosition } from "@/types/portfolio";
import s from "./portfolio.module.css";

type Props = {
  positions: RecordedPosition[];
  loading: boolean;
  error: boolean;
  hasFilters: boolean;
  onRetry: () => void;
  onClearFilters: () => void;
};
export function PortfolioPositions({
  positions,
  loading,
  error,
  hasFilters,
  onRetry,
  onClearFilters,
}: Props) {
  if (loading)
    return (
      <div className={s.empty} role="status">
        Reading position records…
      </div>
    );
  if (error)
    return (
      <div className={s.empty} role="alert">
        LP records could not be loaded.<button onClick={onRetry}>Retry</button>
      </div>
    );
  return (
    <>
      <table>
        <thead>
          <tr>
            <th>Position</th>
            <th>Network</th>
            <th>Range</th>
            <th>Pool fee</th>
            <th>Registration</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((position) => (
            <tr key={position.id}>
              <td>
                <Link href="/lp">
                  <strong>
                    {position.tokens.map((token) => token.symbol).join(" / ")}{" "}
                    <ArrowUpRight size={12} />
                  </strong>
                </Link>
                <small className={s.balanceSymbol}>Aqua shared liquidity</small>
              </td>
              <td>{network(position.chainId).name}</td>
              <td>{position.range}</td>
              <td>
                {position.feeBps === null ? "N/A" : `${position.feeBps / 100}%`}
              </td>
              <td>
                {position.registrationBlock ? (
                  <a
                    href={`${network(position.chainId).explorer}/block/${position.registrationBlock}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Block {position.registrationBlock}{" "}
                    <ArrowUpRight size={12} />
                  </a>
                ) : (
                  "Awaiting confirmation"
                )}
              </td>
              <td>
                <span
                  className={position.state === "active" ? s.status : s.count}
                >
                  {positionStateLabel(position.state)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!positions.length && (
        <div className={s.empty}>
          No AquaMux-managed LP positions{" "}
          {!hasFilters ? "found for this wallet." : "on this network."}
          {hasFilters && (
            <button onClick={onClearFilters}>Clear filters</button>
          )}
        </div>
      )}
    </>
  );
}
