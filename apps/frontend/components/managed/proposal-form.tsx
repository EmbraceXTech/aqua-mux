import { useEffect, useRef, useState } from "react";
import { type Address } from "viem";
import { networks, type ChainId } from "@/lib/config";
import { Button } from "../ui/button";
import { TokenSelect, type SelectedToken } from "./token-select";
import type { RecipeId } from "./strategy-catalog";
import { titleLabel } from "./format";
import type { ManagedSession } from "@/lib/managed-client/api";
import { validateProposalFunding } from "@/lib/managed-client/proposal-validation";
import type { TokenPairValidation } from "@/lib/token-registry";
import { RouteChecks } from "./route-checks";
import { exactAmount } from "@/lib/managed-client/numeric-input";

export type ProposalIntent = {
  recipeId: RecipeId;
  chainId: ChainId;
  maker: Address;
  fundingToken: Address;
  budget: string;
  gasReserveWei: string;
  permittedAssets: Address[];
  holdingPeriodMs: number;
  intervalMs: number;
};

export function ProposalForm({
  recipe,
  account,
  session,
  busy,
  onSubmit,
  onBack,
}: {
  recipe: RecipeId;
  account?: Address;
  session?: ManagedSession;
  busy: boolean;
  onSubmit: (intent: ProposalIntent) => Promise<void>;
  onBack: () => void;
}) {
  const [chainId, setChainId] = useState<ChainId>(42161);
  const [funding, setFunding] = useState<SelectedToken>();
  const [assets, setAssets] = useState<SelectedToken[]>([]);
  const [budget, setBudget] = useState("");
  const [reserve, setReserve] = useState("0.002");
  const [interval, setInterval] = useState("15");
  const [days, setDays] = useState("7");
  const [error, setError] = useState("");
  const [checks, setChecks] = useState<TokenPairValidation[]>([]);
  const [checking, setChecking] = useState(false);
  const inputRevision = useRef(0);
  useEffect(() => {
    const revision = inputRevision;
    return () => {
      revision.current += 1;
    };
  }, []);
  function invalidateChecks() {
    inputRevision.current += 1;
    setChecks([]);
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const revision = inputRevision.current;
    setError("");
    try {
      if (!account || !session || !funding)
        throw new Error("Connect a wallet and choose a funding token.");
      if (!assets.length)
        throw new Error("Choose at least one permitted paired asset.");
      if (
        !/^\d+(\.\d+)?$/.test(budget) ||
        exactAmount(budget, funding.decimals) <= 0n
      )
        throw new Error("Enter a positive funding budget.");
      if (!/^\d+(\.\d+)?$/.test(reserve))
        throw new Error("Enter a native gas reserve.");
      if (Number(interval) < 1 || Number(days) <= 0)
        throw new Error(
          "Choose a positive review interval and holding period.",
        );
      setChecking(true);
      setChecks([]);
      const rawBudget = await validateProposalFunding({
        chainId,
        funding,
        assets,
        budget,
        session,
        assertCurrent: () => {
          if (revision !== inputRevision.current)
            throw new Error(
              "Inputs changed during route checks. Submit the updated proposal.",
            );
        },
        onCheck: (check) => setChecks((current) => [...current, check]),
      });
      await onSubmit({
        recipeId: recipe,
        chainId,
        maker: account,
        fundingToken: funding.address,
        budget: rawBudget,
        gasReserveWei: exactAmount(reserve, 18).toString(),
        permittedAssets: [
          ...new Set([
            funding.address,
            ...assets.map((asset) => asset.address),
          ]),
        ],
        holdingPeriodMs: Number(days) * 86_400_000,
        intervalMs: Number(interval) * 60_000,
      });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Proposal request failed.",
      );
    } finally {
      setChecking(false);
    }
  }
  return (
    <form
      onSubmit={submit}
      onChange={() => {
        inputRevision.current += 1;
        setChecks([]);
      }}
      className="managed-stack"
    >
      <div className="managed-heading">
        <div>
          <span className="managed-eyebrow">FRESH WALLET ANALYSIS</span>
          <h1>{titleLabel(recipe)}</h1>
          <p>
            Choose the inventory this group may use. The agent must use current
            balances and supported routes.
          </p>
        </div>
        <Button type="button" variant="ghost" onClick={onBack}>
          All strategies
        </Button>
      </div>
      <div className="managed-layout">
        <section className="managed-panel managed-stack">
          <h2>Funding and permitted assets</h2>
          <div className="managed-fields">
            <label className="managed-field">
              <span>Network</span>
              <select
                value={chainId}
                onChange={(event) => {
                  setChainId(Number(event.target.value) as ChainId);
                  setFunding(undefined);
                  setAssets([]);
                }}
              >
                {networks.map((chain) => (
                  <option key={chain.id} value={chain.id}>
                    {chain.name}
                  </option>
                ))}
              </select>
            </label>
            <TokenSelect
              key={`funding-${chainId}`}
              chainId={chainId}
              label="Funding token"
              value={funding}
              onChange={(token) => {
                invalidateChecks();
                setFunding(token);
              }}
            />
            <label className="managed-field">
              <span>Funding budget {funding?.symbol}</span>
              <input
                aria-label="Funding budget"
                inputMode="decimal"
                value={budget}
                placeholder="0.00"
                onChange={(event) => setBudget(event.target.value)}
              />
            </label>
            <label className="managed-field">
              <span>Native gas reserve</span>
              <input
                aria-label="Native gas reserve"
                inputMode="decimal"
                value={reserve}
                onChange={(event) => setReserve(event.target.value)}
              />
            </label>
          </div>
          <TokenSelect
            key={`paired-${chainId}`}
            chainId={chainId}
            label="Add permitted paired asset"
            onChange={(token) => {
              invalidateChecks();
              setAssets((old) =>
                old.some((item) => item.address === token.address)
                  ? old
                  : [...old, token],
              );
            }}
          />
          <div className="managed-actions">
            {assets.map((asset) => (
              <button
                type="button"
                className="managed-badge"
                key={asset.address}
                aria-label={`Remove ${asset.symbol} ${asset.address}`}
                onClick={() => {
                  invalidateChecks();
                  setAssets(
                    assets.filter((item) => item.address !== asset.address),
                  );
                }}
              >
                {asset.symbol} / {asset.address.slice(-6)} / Remove
              </button>
            ))}
          </div>
          <div className="managed-notice">
            Tokens listed in the registry may have no usable route. The proposal
            must verify metadata, balances, and route availability before
            preparing transactions.
          </div>
        </section>
        <aside className="managed-panel managed-stack">
          <h2>Review behavior</h2>
          <div className="managed-fields">
            <label className="managed-field">
              <span>Review interval, minutes</span>
              <input
                aria-label="Review interval, minutes"
                type="number"
                min="1"
                value={interval}
                onChange={(event) => setInterval(event.target.value)}
              />
            </label>
            <label className="managed-field">
              <span>Holding period, days</span>
              <input
                aria-label="Holding period, days"
                type="number"
                min="0.1"
                step="0.1"
                value={days}
                onChange={(event) => setDays(event.target.value)}
              />
            </label>
          </div>
          <p>
            Every transaction requires your confirmation. A review may recommend
            holding, reducing size, or doing nothing.
          </p>
          <div className="managed-notice">
            <strong>Execution wallet</strong>
            <div className="managed-address">
              {account ?? "Connect a wallet to continue"}
            </div>
            Gas reserve remains outside the selected trade budget.
          </div>
          <p className="managed-footnote">
            Development reviews are uncharged. Delegated execution and paid
            Hedera reviews are unavailable.
          </p>
          <Button type="submit" disabled={busy || checking || !account}>
            {checking
              ? "Checking metadata and routes..."
              : busy
                ? "Analyzing current wallet..."
                : "Generate fresh proposal"}
          </Button>
        </aside>
      </div>
      <RouteChecks checks={checks} />
      {error && (
        <div className="managed-notice managed-error" role="alert">
          {error}
        </div>
      )}
    </form>
  );
}
