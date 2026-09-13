import { CircleHelp } from "lucide-react";
import s from "./portfolio.module.css";

export function PortfolioPerformance({
  connected,
  loading,
}: {
  connected: boolean;
  loading: boolean;
}) {
  return (
    <section
      className={`${s.card} ${s.performance}`}
      aria-label="Portfolio performance"
    >
      <div className={s.cardTop}>
        <span className={s.label}>
          Total portfolio value{" "}
          <span title="USD valuation and historical wallet snapshots are not provided by the current data service.">
            <CircleHelp size={13} />
          </span>
        </span>
        <span className={s.live}>
          <span />
          {!connected
            ? "Wallet not connected"
            : loading
              ? "Updating balances"
              : "Wallet snapshot"}
        </span>
      </div>
      <div className={s.value}>
        N/A<span> USD</span>
      </div>
      <div className={s.performanceBar}>
        <div className={s.gain}>
          <small>Performance history unavailable</small>
        </div>
        <div className={s.periods} aria-label="Chart time range">
          {["24H", "1W", "1M", "1Y"].map((period) => (
            <button
              key={period}
              disabled
              title="Historical portfolio values are not available"
              className={period === "1M" ? s.chosen : ""}
            >
              {period}
            </button>
          ))}
        </div>
      </div>
      <div className={s.chart}>
        <div className={s.gridLines}>
          <span>USD</span>
          <span>USD</span>
          <span>USD</span>
        </div>
        <div className={s.chartEmpty}>
          {connected
            ? "Your balances are available below."
            : "Connect a wallet to get started."}
          <small>USD prices and historical returns are not available.</small>
        </div>
      </div>
      <div className={s.axis}>
        <span>Historical wallet snapshots required</span>
      </div>
      <div className={s.chartFooter}>
        <span>
          <span className={s.blueDot} />
          Portfolio value
        </span>
        <span>USD</span>
      </div>
    </section>
  );
}
