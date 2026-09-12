"use client";

import { useEffect, useState } from "react";
import {
  CircleDollarSign,
  Layers3,
  Loader2,
  RefreshCw,
  Wallet,
} from "lucide-react";
import { networks, network, tokens, type ChainId } from "@/lib/config";
import type { StrategyGroup, Token as ManagedToken } from "@/lib/managed";
import {
  managedRequest,
  type GroupDetail,
  type ManagedSession,
} from "@/lib/managed-client/api";
import { useManagedSession } from "@/lib/managed-client/use-managed-session";
import { MainLayout } from "@/components/layouts/MainLayout";
import { NetworkIcon } from "@/components/managed/token-icon";
import { Button } from "@/components/ui/button";

type Balances = Record<string, string | null>;

type RecordedPosition = {
  id: string;
  groupId: string;
  chainId: number;
  state: "pending" | "active" | "docked" | "unknown";
  groupState: StrategyGroup["state"];
  registrationBlock: string | null;
  tokens: ManagedToken[];
  range: string;
  feeBps: number | null;
};

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function amountLabel(value: string) {
  const [whole, fraction = ""] = value.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const displayedFraction = fraction.slice(0, 6).replace(/0+$/, "");
  return displayedFraction ? `${grouped}.${displayedFraction}` : grouped;
}

function positionStateLabel(state: RecordedPosition["state"]) {
  return state.charAt(0).toUpperCase() + state.slice(1);
}

function positionFromDetail(detail: GroupDetail): RecordedPosition[] {
  if (detail.group.config.family !== "lp") return [];

  return (detail.strategies ?? []).map((strategy) => {
    const pair = detail.group.config.pairs.find(
      (candidate) =>
        strategy.tokens.some(
          (token) => token.address === candidate.baseToken.address,
        ) &&
        strategy.tokens.some(
          (token) => token.address === candidate.quoteToken.address,
        ),
    );

    return {
      id: strategy.id,
      groupId: detail.group.id,
      chainId: detail.group.chainId,
      state: strategy.state,
      groupState: detail.group.state,
      registrationBlock: strategy.registrationBlock,
      tokens: strategy.tokens,
      range:
        pair?.range.kind === "full"
          ? "Full range"
          : pair
            ? "Custom range"
            : "Range unavailable",
      feeBps: pair?.feeBps ?? null,
    };
  });
}

async function readBalances(
  account: string,
  chainId: ChainId,
  signal: AbortSignal,
) {
  const response = await fetch(
    `/api/balances?chainId=${chainId}&address=${account}`,
    { cache: "no-store", signal },
  );
  const result = (await response.json().catch(() => null)) as
    | { balances?: Balances; error?: string }
    | null;
  if (!response.ok || !result?.balances)
    throw new Error(result?.error ?? "Wallet balances could not be loaded.");
  return result.balances;
}

function PortfolioHeaderActions({
  session,
  busy,
  localWalletAvailable,
  onConnect,
  onDisconnect,
}: {
  session?: ManagedSession;
  busy: boolean;
  localWalletAvailable: boolean;
  onConnect: (mode: "external" | "local-development") => void;
  onDisconnect: () => void;
}) {
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
  const [balances, setBalances] = useState<Balances>();
  const [positions, setPositions] = useState<RecordedPosition[]>();
  const [balanceError, setBalanceError] = useState("");
  const [positionError, setPositionError] = useState("");
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [positionsLoading, setPositionsLoading] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!session) {
      setBalances(undefined);
      setBalanceError("");
      setBalancesLoading(false);
      return;
    }

    const controller = new AbortController();
    setBalancesLoading(true);
    setBalanceError("");
    readBalances(session.owner, chainId, controller.signal)
      .then((result) => setBalances(result))
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setBalances(undefined);
        setBalanceError(
          cause instanceof Error
            ? cause.message
            : "Wallet balances could not be loaded.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setBalancesLoading(false);
      });

    return () => controller.abort();
  }, [chainId, revision, session]);

  useEffect(() => {
    if (!session) {
      setPositions(undefined);
      setPositionError("");
      setPositionsLoading(false);
      return;
    }

    const controller = new AbortController();
    setPositionsLoading(true);
    setPositionError("");
    managedRequest<{ groups: StrategyGroup[] }>(
      "/groups",
      session,
      undefined,
      undefined,
      controller.signal,
    )
      .then(async ({ groups }) => {
        const details = await Promise.all(
          groups
            .filter((group) => group.config.family === "lp")
            .map((group) =>
              managedRequest<GroupDetail>(
                `/groups/${group.id}`,
                session,
                undefined,
                undefined,
                controller.signal,
              ),
            ),
        );
        if (!controller.signal.aborted)
          setPositions(details.flatMap(positionFromDetail));
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setPositions(undefined);
        setPositionError(
          cause instanceof Error
            ? cause.message
            : "Aqua LP positions could not be loaded.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setPositionsLoading(false);
      });

    return () => controller.abort();
  }, [revision, session]);

  const listedTokens = tokens(chainId).filter((token) => {
    const balance = balances?.[token.address];
    return balance !== null && balance !== undefined && !/^0(?:\.0+)?$/.test(balance);
  });
  const selectedNetwork = network(chainId);
  const loading = balancesLoading || positionsLoading;

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
            <p>
              Wallet balances and AquaMux-recorded Aqua LP positions.
            </p>
          </div>
          {session && (
            <Button
              variant="outline"
              disabled={loading}
              onClick={() => setRevision((value) => value + 1)}
            >
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
            <Button disabled={wallet.busy} onClick={() => void wallet.connect("external")}>
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

              <div className="portfolio-network-tabs" role="tablist" aria-label="Balance network">
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
              ) : balanceError ? (
                <div className="error-box" role="alert">
                  {balanceError}
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
                  No non-zero supported asset balances on {selectedNetwork.name}.
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
                  <Loader2 size={18} className="spin" /> Reading position records
                </div>
              ) : positionError ? (
                <div className="error-box" role="alert">
                  {positionError}
                </div>
              ) : positions?.length ? (
                <ul className="portfolio-position-list">
                  {positions.map((position) => (
                    <li key={position.id}>
                      <div className="portfolio-position-topline">
                        <span className="portfolio-pair">
                          <span className="portfolio-pair-icons" aria-hidden="true">
                            {position.tokens.slice(0, 2).map((token) => (
                              <span key={token.address}>
                                {token.symbol.slice(0, 1)}
                              </span>
                            ))}
                          </span>
                          <strong>
                            {position.tokens.map((token) => token.symbol).join(" / ")}
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
