"use client";

"use client";
import { errorMessage } from "@/lib/errors";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowDownUp,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  Layers3,
  Loader2,
  Plus,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Wallet,
  X,
} from "lucide-react";
import { formatUnits, type Address } from "viem";
import { Button } from "../ui/button";
import { Modal } from "../ui/modal";
import { PriceRangeChart } from "../price-range-chart";
import { useManagedSession } from "@/lib/managed-client/use-managed-session";
import { useLegacyQuote } from "@/lib/managed-client/use-legacy-quote";
import { catalogTokenResolver } from "@/lib/managed-client/catalog-token";
import { useTokenSearch } from "@/lib/managed-client/use-token-search";
import {
  defaultPairChartState,
  pairChartKey,
  type PairChartState,
} from "@/lib/price-range";
import {
  networks,
  network,
  tokens,
  wrapped,
  NATIVE,
  type Token,
  type ChainId,
} from "@/lib/config";
import { evenWeights, validateBasket, type Basket } from "@/lib/model";
import {
  walletExecutor,
  type PreparedWalletPlan,
  type WalletExecutionStatus,
  type WalletMode,
} from "@/lib/managed-client/wallet-execution";
import { WalletModePicker } from "../wallet-mode-picker";
import type { TradeWorkspace } from "@/hooks/useTradeWorkspace";

import { NetworkIcon, TokenIcon } from "../managed/token-icon";
import type { Health, Leg, TransactionRecord } from "@/types/swap";
import {
  api,
  compact,
  initialLegs,
  localDevelopmentLegs,
  palette,
  transactionState,
} from "@/lib/utils/swap";

export function TradeOverlays({ trade }: { trade: TradeWorkspace }) {
  const {
    account,
    amount,
    available,
    derivedOpening,
    balances,
    base,
    batch,
    blocked,
    busy,
    catalog,
    chainId,
    chainPicker,
    change,
    chartLeg,
    choose,
    connect,
    copied,
    error,
    execute,
    feeBps,
    fullRange,
    health,
    howOpen,
    legs,
    localDevelopmentWallet,
    mode,
    n,
    now,
    pairedToken,
    pairKey,
    pairState,
    picker,
    plan,
    quote,
    quoteBusy,
    quoteError,
    rangeBounds,
    receiptOpen,
    registryCandidates,
    registrySearch,
    review,
    reviewed,
    search,
    session,
    settings,
    setAmount,
    setBalances,
    setBatch,
    setChainId,
    setChainPicker,
    setChartPair,
    setCopied,
    setError,
    setFeeBps,
    setHowOpen,
    setLegs,
    setPicker,
    setReceiptOpen,
    setReview,
    setReviewed,
    setSearch,
    setSettings,
    setSlippageBps,
    setSource,
    setNetwork,
    setStatus,
    setTransactions,
    setWalletOpen,
    slippageBps,
    source,
    src,
    status,
    total,
    transactions,
    transactionsLoaded,
    unreadTransactions,
    unresolvedTransaction,
    updatePair,
    wallet,
    walletOpen,
    reviewPlan,
    requestId,
    activityOpen,
    setActivityOpen,
  } = trade;

  return (
    <>
      <Modal
        open={chainPicker}
        onOpenChange={setChainPicker}
        title="Choose a network"
        description="Every basket executes on one chain."
      >
        <div className="picker-list">
          {networks.map((net) => (
            <button key={net.id} onClick={() => setNetwork(net.id)}>
              <NetworkIcon chainId={net.id} size={30} />
              <span>
                <strong>{net.name}</strong>
                <small>
                  {health?.networks.find((x) => x.id === net.id)?.online
                    ? "RPC connected"
                    : "Connection unverified"}
                </small>
              </span>
              {net.id === chainId && <Check size={18} />}
            </button>
          ))}
        </div>
      </Modal>
      <Modal
        open={picker !== null}
        onOpenChange={(o) => {
          if (!o) setPicker(null);
        }}
        title={
          picker === "source"
            ? "Choose your input token"
            : "Choose a paired token"
        }
        description={`1inch registry metadata for ${n.name}. Listing does not guarantee a usable route.`}
      >
        <input
          autoFocus
          className="search-input"
          aria-label="Search tokens"
          placeholder="Search name, symbol or address"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {registrySearch.error && (
          <p role="alert">
            Registry unavailable. Showing bundled tokens. {registrySearch.error}
          </p>
        )}
        <div className="picker-list token-picker">
          {available.map((t) => (
            <button
              key={t.address}
              disabled={
                registrySearch.result?.items.find(
                  (item) => item.address === t.address,
                )?.selectable === false
              }
              onClick={() => choose(t)}
            >
              <TokenIcon token={t} />
              <span>
                <strong>{t.symbol}</strong>
                <small>{t.name}</small>
                <small className="managed-address">{t.address}</small>
                <small>
                  {registrySearch.result?.items
                    .find((item) => item.address === t.address)
                    ?.risk.replaceAll("_", " ") ?? "Bundled metadata"}{" "}
                  / route not checked
                </small>
              </span>
              <small>
                {account
                  ? compact(balances[t.address])
                  : `${t.address.slice(0, 6)}...${t.address.slice(-4)}`}
              </small>
            </button>
          ))}
          {!available.length && <p>No matching tokens on this network.</p>}
        </div>
      </Modal>
      <Modal
        open={settings}
        onOpenChange={setSettings}
        title="Transaction settings"
        description="These values become part of the transaction you review."
      >
        <label className="setting-label">
          Slippage tolerance
          <div className="setting-options">
            {[10, 50, 100].map((v) => (
              <button
                className={slippageBps === v ? "selected" : ""}
                key={v}
                onClick={() => {
                  change();
                  setSlippageBps(v);
                }}
              >
                {v / 100}%
              </button>
            ))}
          </div>
        </label>
        <label className="setting-label">
          LP swap fee
          <div className="setting-options">
            {[5, 30, 100].map((v) => (
              <button
                className={feeBps === v ? "selected" : ""}
                key={v}
                onClick={() => {
                  change();
                  setFeeBps(v);
                }}
              >
                {v / 100}%
              </button>
            ))}
          </div>
        </label>
        <p className="muted small">
          The swap fee is encoded in each SwapVM strategy. Fees are earned only
          when trades fill.
        </p>
      </Modal>
      <Modal
        open={walletOpen}
        onOpenChange={setWalletOpen}
        title={account ? "Your wallet" : "Connect your wallet"}
        description="Choose a browser wallet or a configured local development wallet. Each transaction needs a separate confirmation. Browser-wallet transactions require atomic batch support."
      >
        {account ? (
          <>
            <div className="address-box">{account}</div>
            <Button
              variant="outline"
              onClick={() => {
                window.location.assign("/strategies");
              }}
            >
              Open managed liquidity
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                void wallet.disconnect();
                requestId.current += 1;
                setBalances({});
                setReviewed(undefined);
                setWalletOpen(false);
              }}
            >
              Disconnect from AquaMux
            </Button>
          </>
        ) : (
          <WalletModePicker
            busy={busy || wallet.busy}
            developmentWallet={wallet.developmentWallet}
            externalLabel="Connect browser wallet"
            onConnect={(mode) => void connect(mode)}
          />
        )}
        {(error || wallet.error) && (
          <p role="alert" className="error-box">
            {error || wallet.error}
          </p>
        )}
      </Modal>
      <Modal
        open={review}
        onOpenChange={(o) => {
          if (!busy) setReview(o);
        }}
        title={
          plan?.mode === "swap"
            ? "Review your multi-swap"
            : "Review your Aqua positions"
        }
        description={`${n.name}. All calls execute atomically from ${session?.mode === "local-development" ? "the local development wallet after your explicit confirmation" : "your browser wallet"}.`}
      >
        {plan && (
          <>
            <div className="review-summary">
              {plan.summary.map((s) => (
                <p key={s}>{s}</p>
              ))}
            </div>
            <ol className="call-list">
              {plan.calls.map((call, i) => (
                <li key={i}>
                  <span>{i + 1}</span>
                  <div>
                    <strong>{call.label}</strong>
                    <small>{call.to}</small>
                  </div>
                </li>
              ))}
            </ol>
            <div className="muted small">
              Review expires in{" "}
              {Math.max(
                0,
                Math.ceil((plan.expiresAt - (now || plan.createdAt)) / 1000),
              )}
              s.{" "}
              {session?.mode === "local-development"
                ? "The local development signer applies its configured fee cap after you confirm."
                : "Your wallet calculates gas and simulates the batch."}
            </div>
            {error && (
              <p role="alert" className="error-box">
                {error}
              </p>
            )}
            <Button
              className="main-action"
              disabled={busy || now > plan.expiresAt}
              onClick={execute}
            >
              {busy ? (
                <Loader2 className="spin" size={18} />
              ) : session?.mode === "local-development" ? (
                "Confirm with development wallet"
              ) : (
                "Confirm in wallet"
              )}
              <ArrowRight size={16} />
            </Button>
          </>
        )}
      </Modal>
      <Modal
        open={receiptOpen}
        onOpenChange={setReceiptOpen}
        title={
          transactionState(status) === "confirmed"
            ? "Transaction confirmed"
            : transactionState(status) === "pending"
              ? "Transaction submitted"
              : "Check transaction status"
        }
        description={
          transactionState(status) === "confirmed"
            ? "Review the transaction receipt and its confirmation status."
            : transactionState(status) === "pending"
              ? "Your transaction is submitted. Waiting for confirmation."
              : "Check your wallet activity and transaction receipt."
        }
      >
        {batch && (
          <>
            <div className="receipt-status">
              {transactionState(status) === "confirmed" ? (
                <Check size={35} />
              ) : transactionState(status) === "pending" ? (
                <Loader2 className="spin" size={35} />
              ) : (
                <X size={35} />
              )}
              <p>
                {transactionState(status) === "confirmed"
                  ? "Your wallet reported successful execution."
                  : transactionState(status) === "pending"
                    ? "Waiting for on-chain confirmation."
                    : transactionState(status) === "reverted"
                      ? "The wallet reported a reverted batch. Check the transaction receipt."
                      : "Execution is unknown. The wallet response does not prove a complete atomic result. Check its activity before retrying."}
              </p>
            </div>
            <button
              className="copy-id"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(batch.id);
                  setCopied(true);
                } catch {
                  setError("Could not copy the transaction ID.");
                }
              }}
            >
              <Copy size={14} />
              {copied ? "Copied transaction ID" : "Copy transaction ID"}
            </button>
            {status?.transactionHash && (
              <a
                className="primary-link"
                href={`${network(batch.chainId).explorer}/tx/${status.transactionHash}`}
                target="_blank"
                rel="noreferrer"
              >
                View transaction <ExternalLink size={14} />
              </a>
            )}
            {status?.receipts?.map((receipt) => (
              <a
                className="primary-link"
                key={receipt.transactionHash}
                href={`${network(batch.chainId).explorer}/tx/${receipt.transactionHash}`}
                target="_blank"
                rel="noreferrer"
              >
                View transaction <ExternalLink size={14} />
              </a>
            ))}
            <Button
              variant="outline"
              onClick={() => {
                window.location.assign("/strategies");
              }}
            >
              Open managed liquidity
            </Button>
          </>
        )}
      </Modal>
      <Modal
        open={howOpen}
        onOpenChange={setHowOpen}
        title="How AquaMux works"
        description="A multiplexer for swaps and wallet-backed liquidity."
      >
        <div className="explanation">
          <h3>Multi-swap</h3>
          <p>
            Split an input amount by percentage. AquaMux requests a 1inch route
            for each output and asks your wallet to execute the calls
            atomically. If a leg fails, the whole transaction reverts. SwapVM is
            used for LP pricing; basket swaps use the 1inch Swap API.
          </p>
          <h3>Multi-LP</h3>
          <p>
            Choose a base balance and amounts of paired tokens you already own.
            AquaMux builds one SwapVM strategy per pair and registers them with
            Aqua. Native ETH or BNB is wrapped first. The same base balance
            backs all pairs.
          </p>
          <p>
            Shared allocations are not extra capital. A fill reduces the real
            inventory available to other pairs. Tokens remain in your wallet
            after registration, under an allowance to Aqua.
          </p>
          <h3>One transaction requires wallet support</h3>
          <p>
            AquaMux checks EIP-5792 atomic capability before sending. Wallets
            without it cannot execute this batch. Strategies use 1inch&apos;s
            resolver access check. Registration does not guarantee routing,
            fills, fees, or resolver discovery.
          </p>
        </div>
      </Modal>
    </>
  );
}
