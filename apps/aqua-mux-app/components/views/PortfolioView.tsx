"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CircleDollarSign,
  Layers3,
  Loader2,
  RefreshCw,
  Wallet,
} from "lucide-react";
import { networks, network, tokens, type ChainId } from "@/lib/config";
import {
  amountLabel,
  positionStateLabel,
  shortAddress,
} from "@/lib/utils/portfolio";
import { useManagedSession } from "@/lib/managed-client/use-managed-session";
import {
  fetchRecordedPositions,
  fetchWalletBalances,
} from "@/services/portfolio";
import type { PortfolioHeaderActionsProps } from "@/types/portfolio";
import { MainLayout } from "@/components/layouts/MainLayout";
import { NetworkIcon } from "@/components/managed/token-icon";
import { Button } from "@/components/ui/button";

function PortfolioHeaderActions({
  session,
  busy,
  localWalletAvailable,
  onConnect,
  onDisconnect,
}: PortfolioHeaderActionsProps) {
  if (session)
    return (
      <>
        <span className="portfolio-wallet-address" title={session.owner}>
          <Wallet size={15} /> {shortAddress(session.owner)}
        </span>
        <Button variant="outline" disabled={busy} onClick={onDisconnect}>
          Disconnect
        </Button>
      </>
    );

  return (
    <>
      <Button disabled={busy} onClick={() => onConnect("external")}>
        <Wallet size={16} />
        {busy ? "Waiting for wallet" : "Connect wallet"}
      </Button>
      {localWalletAvailable && (
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => onConnect("local-development")}
        >
          Local wallet
        </Button>
      )}
    </>
  );
}

export function PortfolioView() {
  const wallet = useManagedSession(42161);
  const session = wallet.session;
  const [chainId, setChainId] = useState<ChainId>(42161);
  const balanceQuery = useQuery({
    queryKey: ["portfolio", "balances", session?.owner, chainId],
    queryFn: ({ signal }) =>
      fetchWalletBalances({ account: session!.owner, chainId }, signal),
    enabled: !!session,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });
  const positionQuery = useQuery({
    queryKey: ["portfolio", "positions", session?.owner, session?.sessionId],
    queryFn: ({ signal }) => fetchRecordedPositions(session!, signal),
    enabled: !!session,
  });

  const balances = balanceQuery.data;
  const positions = positionQuery.data;
  const balanceErrorMessage =
    balanceQuery.error instanceof Error
      ? balanceQuery.error.message
      : balanceQuery.isError
        ? "Wallet balances could not be loaded."
        : "";
  const positionErrorMessage =
    positionQuery.error instanceof Error
      ? positionQuery.error.message
      : positionQuery.isError
        ? "Aqua LP positions could not be loaded."
        : "";
  const balancesLoading = balanceQuery.isPending;
  const positionsLoading = positionQuery.isPending;
  const listedTokens = tokens(chainId).filter((token) => {
    const balance = balances?.[token.address];
    return (
      balance !== null && balance !== undefined && !/^0(?:\.0+)?$/.test(balance)
    );
  });
  const selectedNetwork = network(chainId);
  const loading = balanceQuery.isFetching || positionQuery.isFetching;

  function refresh() {
    void Promise.all([balanceQuery.refetch(), positionQuery.refetch()]);
  }

  return (
    <MainLayout
      activePage="portfolio"
      actions={
        <PortfolioHeaderActions
          session={session}
          busy={wallet.busy}
          localWalletAvailable={wallet.developmentWallet?.available === true}
          onConnect={(mode) => void wallet.connect(mode)}
          onDisconnect={() => void wallet.disconnect()}
        />
      }
    >
      <div className="portfolio-main">
        <header className="portfolio-heading">
          <div>
            <span className="portfolio-kicker">PORTFOLIO</span>
            <h1>Your wallet, at a glance.</h1>
            <p>Wallet balances and AquaMux-recorded Aqua LP positions.</p>
          </div>
          {session && (
            <Button variant="outline" disabled={loading} onClick={refresh}>
              <RefreshCw size={15} className={loading ? "spin" : ""} />
              Refresh
            </Button>
          )}
        </header>

        {wallet.error && (
          <div className="error-box" role="alert">
            {wallet.error}
          </div>
        )}

        {!session ? (
          <section className="portfolio-connect">
            <div className="portfolio-connect-icon">
              <Wallet size={26} />
            </div>
            <h2>Connect a wallet to view your portfolio</h2>
            <p>
              Sign in to read supported wallet balances and AquaMux-managed LP
              records. Connecting does not send a transaction.
            </p>
            <Button
              disabled={wallet.busy}
              onClick={() => void wallet.connect("external")}
            >
              <Wallet size={17} />
              {wallet.busy ? "Waiting for wallet" : "Connect wallet"}
            </Button>
          </section>
        ) : (
          <div className="portfolio-grid">
            <section className="portfolio-section portfolio-balances">
              <div className="portfolio-section-heading">
                <div>
                  <span className="portfolio-section-icon">
                    <CircleDollarSign size={17} />
                  </span>
                  <div>
                    <h2>Wallet balances</h2>
                    <p>{selectedNetwork.name} verified asset list</p>
                  </div>
                </div>
              </div>

              <div
                className="portfolio-network-tabs"
                role="tablist"
                aria-label="Balance network"
              >
                {networks.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={chainId === item.id}
                    className={chainId === item.id ? "active" : ""}
                    onClick={() => setChainId(item.id)}
                  >
                    <NetworkIcon chainId={item.id} size={18} />
                    {item.name}
                  </button>
                ))}
              </div>

              {balancesLoading ? (
                <div className="portfolio-loading" role="status">
                  <Loader2 size={18} className="spin" /> Reading balances
                </div>
              ) : balanceErrorMessage ? (
                <div className="error-box" role="alert">
                  {balanceErrorMessage}
                </div>
              ) : listedTokens.length ? (
                <ul className="portfolio-balance-list">
                  {listedTokens.map((token) => (
                    <li key={token.address}>
                      <span className="portfolio-token-mark">
                        {token.symbol.slice(0, 2)}
                      </span>
                      <span>
                        <strong>{token.symbol}</strong>
                        <small>{token.name}</small>
                      </span>
                      <strong className="portfolio-amount">
                        {amountLabel(balances?.[token.address] ?? "0")}
                      </strong>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="portfolio-empty">
                  No non-zero supported asset balances on {selectedNetwork.name}
                  .
                </p>
              )}
            </section>

            <section className="portfolio-section portfolio-positions">
              <div className="portfolio-section-heading">
                <div>
                  <span className="portfolio-section-icon aqua">
                    <Layers3 size={17} />
                  </span>
                  <div>
                    <h2>Aqua LP positions</h2>
                    <p>AquaMux-managed position records</p>
                  </div>
                </div>
              </div>

              {positionsLoading ? (
                <div className="portfolio-loading" role="status">
                  <Loader2 size={18} className="spin" /> Reading position
                  records
                </div>
              ) : positionErrorMessage ? (
                <div className="error-box" role="alert">
                  {positionErrorMessage}
                </div>
              ) : positions?.length ? (
                <ul className="portfolio-position-list">
                  {positions.map((position) => (
                    <li key={position.id}>
                      <div className="portfolio-position-topline">
                        <span className="portfolio-pair">
                          <span
                            className="portfolio-pair-icons"
                            aria-hidden="true"
                          >
                            {position.tokens.slice(0, 2).map((token) => (
                              <span key={token.address}>
                                {token.symbol.slice(0, 1)}
                              </span>
                            ))}
                          </span>
                          <strong>
                            {position.tokens
                              .map((token) => token.symbol)
                              .join(" / ")}
                          </strong>
                        </span>
                        <span className={`portfolio-status ${position.state}`}>
                          {positionStateLabel(position.state)}
                        </span>
                      </div>
                      <dl className="portfolio-position-facts">
                        <div>
                          <dt>Network</dt>
                          <dd>
                            <NetworkIcon chainId={position.chainId} size={14} />
                            {network(position.chainId).name}
                          </dd>
                        </div>
                        <div>
                          <dt>Range</dt>
                          <dd>{position.range}</dd>
                        </div>
                        <div>
                          <dt>Fee</dt>
                          <dd>
                            {position.feeBps === null
                              ? "Unavailable"
                              : `${position.feeBps / 100}%`}
                          </dd>
                        </div>
                        <div>
                          <dt>Registration</dt>
                          <dd>
                            {position.registrationBlock
                              ? `Block ${position.registrationBlock}`
                              : "Awaiting confirmation"}
                          </dd>
                        </div>
                      </dl>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="portfolio-empty">
                  No AquaMux-managed LP positions were found for this wallet.
                </p>
              )}

              <p className="portfolio-footnote">
                This list includes LP positions stored by AquaMux. It does not
                discover positions registered outside the app.
              </p>
            </section>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
