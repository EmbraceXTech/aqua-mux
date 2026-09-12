import { OwnerExport } from "./owner-export";
import { Wallet } from "lucide-react";
import type { DevWalletAvailability } from "@/lib/dev-wallet";
import type { ManagedSession } from "@/lib/managed-client/api";
import type { WalletMode } from "@/lib/managed-client/wallet-execution";
import { WalletModePicker } from "../wallet-mode-picker";
import { Button } from "../ui/button";

export function WalletBar({
  session,
  busy,
  developmentWallet,
  onConnect,
  onDisconnect,
}: {
  session?: ManagedSession;
  busy: boolean;
  developmentWallet?: DevWalletAvailability;
  onConnect: (mode: WalletMode) => Promise<void>;
  onDisconnect: () => Promise<void>;
}) {
  return (
    <div className="managed-toolbar">
      <div className="managed-actions">
        <Wallet size={18} />
        <div>
          {session ? (
            <>
              <strong>
                {session.mode === "local-development"
                  ? "Local development wallet"
                  : "Authenticated wallet"}
              </strong>
              <div className="managed-address">{session.owner}</div>
            </>
          ) : (
            <>
              <strong>Manage liquidity with your wallet</strong>
              <p className="muted small">
                Authenticate ownership to recover your groups.
              </p>
            </>
          )}
        </div>
      </div>
      <div className="managed-actions">
        {session ? (
          <>
            <OwnerExport key={session.sessionId} session={session} />
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => void onDisconnect()}
            >
              Disconnect managed wallet
            </Button>
          </>
        ) : (
          <WalletModePicker
            busy={busy}
            developmentWallet={developmentWallet}
            externalLabel="Connect and authenticate wallet"
            onConnect={(mode) => void onConnect(mode)}
          />
        )}
      </div>
    </div>
  );
}
