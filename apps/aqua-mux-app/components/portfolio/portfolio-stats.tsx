import { ArrowUpRight, Layers, Wallet } from "lucide-react";
import s from "./portfolio.module.css";

export function PortfolioStats({
  countLabel,
  activePositions,
}: {
  countLabel: string;
  activePositions: number;
}) {
  return (
    <div className={s.stats}>
      <div>
        <span className={s.statIcon}>
          <Wallet size={18} />
        </span>
        <div>
          <span>Available balance</span>
          <strong>N/A</strong>
        </div>
        <span className={s.statNote}>{countLabel}</span>
      </div>
      <div>
        <span className={`${s.statIcon} ${s.purple}`}>
          <Layers size={18} />
        </span>
        <div>
          <span>In liquidity</span>
          <strong>N/A</strong>
        </div>
        <span className={s.statNote}>{activePositions} active positions</span>
      </div>
      <div>
        <span className={`${s.statIcon} ${s.green}`}>
          <ArrowUpRight size={18} />
        </span>
        <div>
          <span>Fees earned · 30D</span>
          <strong>N/A</strong>
        </div>
        <span className={s.statNote}>Fee earnings unavailable</span>
      </div>
    </div>
  );
}
