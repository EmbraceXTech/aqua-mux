import { Wallet } from "lucide-react";
import type { ManagedSession } from "@/lib/managed-client/api";
import { Button } from "../ui/button";

export function WalletBar({
  session,
  busy,
  onConnect,
  onDisconnect,
}: {
  session?: ManagedSession;
  busy: boolean;
  onConnect: (mode: "external" | "local-development") => Promise<void>;
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
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => void onDisconnect()}
          >
            Disconnect managed wallet
          </Button>
        ) : (
          <>
            <Button disabled={busy} onClick={() => void onConnect("external")}>
              Connect and authenticate wallet
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void onConnect("local-development")}
            >
              Use local development wallet
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
