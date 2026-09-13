"use client";

import { useState } from "react";
import { Check, ChevronDown, Wallet } from "lucide-react";
import { NetworkIcon } from "@/components/managed/token-icon";
import { Modal } from "@/components/ui/modal";
import { WalletModePicker } from "@/components/wallet-mode-picker";
import { network, networks } from "@/lib/config";
import { useManagedSession } from "@/lib/managed-client/use-managed-session";
import {
  saveSelectedChainId,
  selectedChainId,
} from "@/lib/selected-chain";

export function WalletControls() {
  const [chainId, setChainId] = useState(selectedChainId);
  const [chainPickerOpen, setChainPickerOpen] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const wallet = useManagedSession(chainId);
  const account = wallet.session?.owner;

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
