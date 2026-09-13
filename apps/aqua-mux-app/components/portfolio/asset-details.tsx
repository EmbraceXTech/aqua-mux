"use client";

import type { PortfolioAsset as Asset } from "@/types/portfolio";
import { network } from "@/lib/config";
import { useEffect, useId, useRef, useState } from "react";
import { ArrowUpRight, Check, Wallet, X } from "lucide-react";
import { amountLabel, shortAddress } from "@/lib/utils/portfolio";
import { AssetMark } from "./asset-mark";
import s from "./portfolio.module.css";

export function AssetDetails({
  asset,
  onClose,
}: {
  asset: Asset;
  onClose: () => void;
}) {
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const node = dialog.current;
    node?.showModal();
    return () => {
      node?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className={`${s.modal} ${s.liveModal}`}
      aria-labelledby={titleId}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const rect = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            onClose();
        }
      }}
    >
      <button
        className={`${s.iconButton} ${s.close}`}
        onClick={onClose}
        aria-label="Close asset details"
      >
        <X size={20} />
      </button>
      <AssetMark asset={asset} />
      <h2 id={titleId}>{asset.name}</h2>
      <p>
        {asset.symbol} on {network(asset.chainId).name}
      </p>
      <strong className={s.modalValue}>
        {amountLabel(asset.balance)} {asset.symbol}
      </strong>
      <dl>
        <div>
          <dt>Balance</dt>
          <dd className={s.exactBalance}>{asset.balance}</dd>
        </div>
        <div>
          <dt>USD valuation</dt>
          <dd>Unavailable</dd>
        </div>
        <div>
          <dt>Token address</dt>
          <dd>
            <a
              href={`${network(asset.chainId).explorer}/address/${asset.address}`}
              target="_blank"
              rel="noreferrer"
            >
              {shortAddress(asset.address)} <ArrowUpRight size={12} />
            </a>
          </dd>
        </div>
      </dl>
      <button
        className={s.primary}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(
              `${asset.balance} ${asset.symbol}`,
            );
            setCopied(true);
            setError("");
          } catch {
            setError("Could not copy. Select and copy the balance above.");
          }
        }}
      >
        {copied ? <Check size={16} /> : <Wallet size={16} />}
        {copied ? "Copied balance" : "Copy balance"}
      </button>
      {error && <small role="alert">{error}</small>}
      <small>Supported wallet balance. USD pricing is not available.</small>
    </dialog>
  );
}
