import { Wallet } from "lucide-react";
import type { DevWalletAvailability } from "@/lib/dev-wallet";
import type { WalletMode } from "@/lib/managed-client/wallet-execution";
import { Button } from "./ui/button";

export function WalletModePicker({
  busy,
  developmentWallet,
  externalLabel,
  onConnect,
}: {
  busy: boolean;
  developmentWallet?: DevWalletAvailability;
  externalLabel: string;
  onConnect: (mode: WalletMode) => void;
}) {
  return (
    <div className="managed-stack">
      <Button
        disabled={busy}
        className="main-action"
        onClick={() => onConnect("external")}
      >
        <Wallet size={18} />
        {busy ? "Waiting for wallet" : externalLabel}
      </Button>
      {developmentWallet?.available && (
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => onConnect("local-development")}
        >
          Use local development wallet
        </Button>
      )}
      {developmentWallet && !developmentWallet.available && (
        <p className="muted small" role="status">
          Local development wallet unavailable. {developmentWallet.error}
        </p>
      )}
    </div>
  );
}
