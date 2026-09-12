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

export function TradeHeaderActions({ trade }: { trade: TradeWorkspace }) {
  const {
    account,
    activityOpen,
    chainId,
    n,
    setActivityOpen,
    setActivityOpen: markActivityOpen,
    setBatch,
    setChainPicker,
    setReceiptOpen,
    setStatus,
    setTransactions,
    setWalletOpen,
    transactions,
    unreadTransactions,
  } = trade;
  return (
    <div className="header-actions">
      <div className="activity-popover">
        <button
          className="activity-button"
          aria-label={`Recent transactions${unreadTransactions ? `, ${unreadTransactions} unread` : ""}`}
          aria-expanded={activityOpen}
          onClick={() => {
            setActivityOpen((open) => !open);
            setTransactions((old) =>
              old.map((transaction) => ({ ...transaction, read: true })),
            );
          }}
        >
          <Bell size={17} />
          {unreadTransactions > 0 && (
            <span className="activity-count">{unreadTransactions}</span>
          )}
        </button>
        {activityOpen && (
          <div
            className="activity-menu"
            role="dialog"
            aria-label="Recent transactions"
          >
            <strong>Recent transactions</strong>
            {transactions.length ? (
              <div className="activity-list">
                {transactions.map((transaction) => (
                  <button
                    key={transaction.id}
                    onClick={() => {
                      setBatch(transaction);
                      setStatus(transaction.status ?? { state: "pending" });
                      setActivityOpen(false);
                      setReceiptOpen(true);
                    }}
                  >
                    <span>
                      <NetworkIcon chainId={transaction.chainId} size={24} />
                      <span>
                        <strong>
                          {transaction.mode === "swap"
                            ? "Multi-swap"
                            : "Liquidity"}
                        </strong>
                        <small>
                          {network(transaction.chainId).name} ·{" "}
                          {new Date(transaction.submittedAt).toLocaleString()}
                        </small>
                      </span>
                    </span>
                    <small
                      className={`transaction-state state-${transactionState(transaction.status) === "confirmed" ? 200 : transactionState(transaction.status) === "pending" ? 100 : 500}`}
                    >
                      {transactionState(transaction.status) === "confirmed"
                        ? "Confirmed"
                        : transactionState(transaction.status) === "pending"
                          ? "Pending"
                          : "Check status"}
                    </small>
                  </button>
                ))}
              </div>
            ) : (
              <p>No recent transactions.</p>
            )}
          </div>
        )}
      </div>
      <button className="network-button" onClick={() => setChainPicker(true)}>
        <NetworkIcon chainId={chainId} />
        <span>{n.name}</span>
        <ChevronDown size={14} />
      </button>
      <Button
        onClick={() => setWalletOpen(true)}
        variant="outline"
        className="wallet-button"
      >
        <Wallet size={15} />
        {account
          ? `${account.slice(0, 6)}...${account.slice(-4)}`
          : "Connect wallet"}
      </Button>
    </div>
  );
}
