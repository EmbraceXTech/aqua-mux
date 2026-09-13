import { Download, RefreshCw } from "lucide-react";
import s from "./portfolio.module.css";

type Props = {
  connected: boolean;
  loading: boolean;
  canExport: boolean;
  onRefresh: () => void;
  onExport: () => void;
};
export function PortfolioHeading({
  connected,
  loading,
  canExport,
  onRefresh,
  onExport,
}: Props) {
  return (
    <div className={s.heading}>
      <div>
        <div className={s.eyebrow}>YOUR ONCHAIN OVERVIEW</div>
        <h1>Portfolio</h1>
        <p>Every asset. Every position. One place.</p>
      </div>
      <div className={s.headingActions}>
        {connected && (
          <button
            className={s.secondary}
            disabled={loading}
            onClick={onRefresh}
          >
            <RefreshCw size={15} className={loading ? "spin" : ""} />
            Refresh
          </button>
        )}
        <button
          className={s.secondary}
          disabled={!canExport}
          onClick={onExport}
        >
          <Download size={15} />
          Export portfolio
        </button>
      </div>
    </div>
  );
}
