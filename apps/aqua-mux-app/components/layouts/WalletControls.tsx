"use client";

import { useEffect, useState } from "react";
import { Bell, Check, ChevronDown, Wallet } from "lucide-react";
import { NetworkIcon } from "@/components/managed/token-icon";
import { Modal } from "@/components/ui/modal";
import { WalletModePicker } from "@/components/wallet-mode-picker";
import { network, networks } from "@/lib/config";
import { useManagedSession } from "@/lib/managed-client/use-managed-session";
import {
  defaultChainId,
  saveSelectedChainId,
  selectedChainId,
} from "@/lib/selected-chain";
import {
  loadSwapActivities,
  swapActivityEvent,
  type SwapActivity,
} from "@/lib/swap-activity";

export function WalletControls() {
  const [chainId, setChainId] = useState(defaultChainId);
  const [chainPickerOpen, setChainPickerOpen] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [activities, setActivities] = useState<SwapActivity[]>([]);
  const wallet = useManagedSession(chainId);
  const account = wallet.session?.owner;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setChainId(selectedChainId());
      setActivities(loadSwapActivities());
    }, 0);
    const update = (event: Event) => {
      const activities = (event as CustomEvent<SwapActivity[]>).detail;
      setActivities(Array.isArray(activities) ? activities : loadSwapActivities());
    };
    window.addEventListener(swapActivityEvent, update);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(swapActivityEvent, update);
    };
  }, []);

  function selectChain(nextChainId: typeof chainId) {
    saveSelectedChainId(nextChainId);
    setChainId(nextChainId);
    setChainPickerOpen(false);
    window.location.reload();
  }

  async function connect(mode: "external" | "local-development") {
    const session = await wallet.connect(mode);
    if (!session) return;
    setWalletOpen(false);
    window.location.reload();
  }

  return (
    <div className="header-actions">
      <div className="activity-popover">
        <button
          className="activity-button"
          aria-label={`Swap activity${activities.length ? `, ${activities.length} transactions` : ""}`}
          aria-expanded={activityOpen}
          aria-haspopup="dialog"
          onClick={() => setActivityOpen((open) => !open)}
        >
          <Bell size={17} />
          {activities.length > 0 && <span className="activity-count">{activities.length}</span>}
        </button>
        {activityOpen && (
          <div className="activity-menu" role="dialog" aria-label="Swap activity">
            <strong>Transactions</strong>
            {activities.length ? (
              <div className="activity-list">
                {activities.map((activity) => (
                  <a
                    key={activity.hash}
                    href={`https://arbiscan.io/tx/${activity.hash}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>
                      <span>
                        <strong>{activity.label}</strong>
                        <small>{`${activity.hash.slice(0, 10)}…${activity.hash.slice(-8)}`}</small>
                      </span>
                    </span>
                    <small className={`transaction-state state-${activity.state}`}>
                      {activity.state}
                    </small>
                  </a>
                ))}
              </div>
            ) : (
              <p>No swap transactions yet.</p>
            )}
          </div>
        )}
      </div>
      <button
        className="network-button"
        onClick={() => setChainPickerOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={chainPickerOpen}
      >
        <NetworkIcon chainId={chainId} />
        <span>{network(chainId).name}</span>
        <ChevronDown size={14} />
      </button>
      <button
        className="ui-button outline-button wallet-button"
        onClick={() => setWalletOpen(true)}
      >
        <Wallet size={15} />
        {account
          ? `${account.slice(0, 6)}...${account.slice(-4)}`
          : "Connect wallet"}
      </button>
      <Modal
        open={chainPickerOpen}
        onOpenChange={setChainPickerOpen}
        title="Choose a network"
        description="Choose the network used for wallet connections and trading."
      >
        <div className="picker-list">
          {networks.map((item) => (
            <button key={item.id} onClick={() => selectChain(item.id)}>
              <NetworkIcon chainId={item.id} size={30} />
              <span>
                <strong>{item.name}</strong>
                <small>{item.symbol}</small>
              </span>
              {item.id === chainId && <Check size={18} />}
            </button>
          ))}
        </div>
      </Modal>
      <Modal
        open={walletOpen}
        onOpenChange={setWalletOpen}
        title={account ? "Your wallet" : "Connect your wallet"}
        description="Connect a browser wallet or a configured local development wallet."
      >
        {account ? (
          <>
            <div className="address-box">{account}</div>
            <button
              className="ui-button outline-button"
              onClick={() => {
                void wallet.disconnect().then(() => window.location.reload());
              }}
            >
              Disconnect from AquaMux
            </button>
          </>
        ) : (
          <WalletModePicker
            busy={wallet.busy}
            developmentWallet={wallet.developmentWallet}
            externalLabel="Connect browser wallet"
            onConnect={(mode) => void connect(mode)}
          />
        )}
        {wallet.error && <p role="alert" className="error-box">{wallet.error}</p>}
      </Modal>
    </div>
  );
}
