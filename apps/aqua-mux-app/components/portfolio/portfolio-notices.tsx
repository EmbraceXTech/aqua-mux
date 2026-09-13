import { Wallet } from "lucide-react";
import s from "./portfolio.module.css";

type Props = {
  error: string;
  connected: boolean;
  loading: boolean;
  failedNetworks: readonly { name: string }[];
  missingBalances: readonly { name: string }[];
  onRetry: () => void;
};
export function PortfolioNotices({
  error,
  connected,
  loading,
  failedNetworks,
  missingBalances,
  onRetry,
}: Props) {
  return (
    <>
      {" "}
      {error && (
        <div className={s.notice} role="alert">
          {error}
        </div>
      )}
      {!connected && (
        <div className={s.notice}>
          <Wallet size={17} />
          <span>
            Connect your wallet to view supported assets and AquaMux LP records.
            Wallet authentication requires a signature, not a transaction.
          </span>
        </div>
      )}
      {connected && failedNetworks.length > 0 && (
        <div className={s.notice} role="alert">
          Balances could not be loaded on{" "}
          {failedNetworks.map((item) => item.name).join(", ")}. Results may be
          incomplete.
          <button onClick={onRetry} disabled={loading}>
            Retry
          </button>
        </div>
      )}
      {connected && missingBalances.length > 0 && (
        <div className={s.notice} role="status">
          Some token balances are unavailable on{" "}
          {missingBalances.map((item) => item.name).join(", ")}. They are not
          counted as zero.
        </div>
      )}
    </>
  );
}
