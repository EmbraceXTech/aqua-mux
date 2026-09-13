"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCheck,
  LockKeyhole,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { networks, wrapped, type ChainId } from "@/lib/config";
import { type ManagedSession } from "@/lib/managed-client/api";
import { exactAmount } from "@/lib/managed-client/numeric-input";
import { validateProposalFunding } from "@/lib/managed-client/proposal-validation";
import {
  TokenSelect,
  type SelectedToken,
} from "@/components/managed/token-select";
import { RouteChecks } from "@/components/managed/route-checks";
import type { ProposalIntent } from "@/components/managed/proposal-form";
import type { TokenPairValidation } from "@/lib/token-registry";
import s from "./strategy-design.module.css";

export function LiveStrategyForm({
  recipe,
  custom,
  session,
  onSubmit,
  navigation,
}: {
  recipe: ProposalIntent["recipeId"];
  custom: boolean;
  session?: ManagedSession;
  onSubmit: (intent: ProposalIntent) => Promise<boolean>;
  navigation: {
    back: () => void;
    review: () => void;
    edit: () => void;
    created: () => void;
  };
}) {
  const [chainId, setChainId] = useState<ChainId>(42161);
  const [behavior, setBehavior] = useState(recipe);
  const [funding, setFunding] = useState<SelectedToken>(wrapped(42161));
  const [assets, setAssets] = useState<SelectedToken[]>([]);
  const [amount, setAmount] = useState("");
  const [reserve, setReserve] = useState("0.002");
  const [interval, setInterval] = useState("15");
  const [days, setDays] = useState("7");
  const [reviewing, setReviewing] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [checks, setChecks] = useState<TokenPairValidation[]>([]);
  const revision = useRef(0);
  useEffect(
    () => () => {
      revision.current += 1;
    },
    [],
  );
  const name =
    behavior === "wide-range-lp"
      ? "Wide-range LP"
      : behavior === "upward-only-lp"
        ? "Upward-only LP"
        : "Concentrated LP";
  function validate() {
    if (!session)
      throw new Error("Connect and authenticate your wallet to continue.");
    if (
      !/^\d+(\.\d+)?$/.test(amount) ||
      exactAmount(amount, funding.decimals) <= 0n
    )
      throw new Error(
        "Enter a positive funding amount within the token's precision.",
      );
    if (!/^\d+(\.\d+)?$/.test(reserve))
      throw new Error("Enter a valid native gas reserve.");
    exactAmount(reserve, 18);
    if (
      !assets.length ||
      assets.some(
        (asset) =>
          asset.address.toLowerCase() === funding.address.toLowerCase(),
      )
    )
      throw new Error(
        "Choose at least one paired asset different from the funding token.",
      );
    if (
      !Number.isFinite(Number(days)) ||
      Number(days) <= 0 ||
      Number(days) > 365
    )
      throw new Error(
        "Holding period must be greater than zero and no more than 365 days.",
      );
  }
  function review() {
    setError("");
    try {
      validate();
      setAcknowledged(false);
      setReviewing(true);
      navigation.review();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Check your inputs.");
    }
  }
  async function submit() {
    if (busy || !acknowledged) return;
    const current = ++revision.current;
    const assertCurrent = () => {
      if (current !== revision.current)
        throw new Error("Strategy inputs changed. Review again.");
    };
    setBusy(true);
    setError("");
    setChecks([]);
    try {
      validate();
      const budget = await validateProposalFunding({
        chainId,
        funding,
        assets,
        budget: amount,
        session: session!,
        assertCurrent,
        onCheck: (check) => setChecks((old) => [...old, check]),
      });
      assertCurrent();
      const created = await onSubmit({
        recipeId: behavior,
        chainId,
        maker: session!.owner,
        fundingToken: funding.address,
        budget,
        gasReserveWei: exactAmount(reserve, 18).toString(),
        permittedAssets: [
          funding.address,
          ...assets.map((asset) => asset.address),
        ],
        holdingPeriodMs: Math.round(Number(days) * 86_400_000),
        intervalMs: Number(interval) * 60_000,
      });
      assertCurrent();
      if (created) navigation.created();
    } catch (cause) {
      if (current === revision.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "Proposal unavailable. Try again.",
        );
    } finally {
      if (current === revision.current) setBusy(false);
    }
  }
  return (
    <div className={s.workspace}>
      <section className={s.panel}>
        <div className={s.panelTitle}>
          <span className={s.recipeIcon}>
            {reviewing ? (
              <CheckCheck size={21} />
            ) : (
              <SlidersHorizontal size={20} />
            )}
          </span>
          <div>
            <h2>
              {reviewing
                ? "Review your plan"
                : custom
                  ? "Build your custom strategy"
                  : "Configure your strategy"}
            </h2>
            <p>
              {name} · {networks.find((chain) => chain.id === chainId)?.name}
            </p>
          </div>
          <button
            className={s.textButton}
            disabled={busy}
            onClick={
              reviewing
                ? () => {
                    setReviewing(false);
                    navigation.edit();
                  }
                : navigation.back
            }
          >
            {reviewing ? "Edit" : "Change"}
          </button>
        </div>
        {!reviewing ? (
          <>
            {custom && (
              <label className={s.field}>
                Range behavior
                <select
                  value={behavior}
                  onChange={(e) =>
                    setBehavior(e.target.value as typeof behavior)
                  }
                >
                  <option value="wide-range-lp">Monitor & review</option>
                  <option value="managed-concentrated-lp">
                    Propose range changes
                  </option>
                  <option value="upward-only-lp">Recenter upward only</option>
                </select>
              </label>
            )}
            <div className={s.fieldGrid}>
              <label className={s.field}>
                Network
                <select
                  value={chainId}
                  onChange={(e) => {
                    const id = Number(e.target.value) as ChainId;
                    setChainId(id);
                    setFunding(wrapped(id));
                    setAssets([]);
                    setAmount("");
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
                  setFunding(token);
                  setAssets((old) =>
                    old.filter(
                      (asset) =>
                        asset.address.toLowerCase() !==
                        token.address.toLowerCase(),
                    ),
                  );
                  setAmount("");
                }}
              />
            </div>
            <div className={s.fieldLabel}>
              <label htmlFor="live-strategy-amount">
                Shared base inventory
              </label>
              <span>Balance verified during proposal analysis</span>
            </div>
            <div className={s.amountBox}>
              <div>
                <input
                  id="live-strategy-amount"
                  inputMode="decimal"
                  value={amount}
                  placeholder="0.00"
                  onChange={(e) => setAmount(e.target.value)}
                />
                <span className={s.asset}>{funding.symbol}</span>
              </div>
              <div>
                <span>No sample balances or estimated returns</span>
              </div>
            </div>
            <p className={s.fieldHelp}>
              This budget backs your selected markets. It is not spent twice.
            </p>
            <div className={s.subheading}>
              <h3>Pair allocation</h3>
              <span>{assets.length} selected markets</span>
            </div>
            <TokenSelect
              key={`quote-${chainId}`}
              chainId={chainId}
              label="Add paired asset"
              onChange={(token) => {
                if (
                  token.address.toLowerCase() !== funding.address.toLowerCase()
                )
                  setAssets((old) =>
                    old.some(
                      (asset) =>
                        asset.address.toLowerCase() ===
                        token.address.toLowerCase(),
                    ) || old.length >= 6
                      ? old
                      : [...old, token],
                  );
              }}
            />
            <div className={s.allocationRows}>
              {assets.map((asset) => (
                <div key={asset.address}>
                  <strong>
                    {funding.symbol} / {asset.symbol}
                  </strong>
                  <button
                    className={s.textButton}
                    aria-label={`Remove ${asset.symbol}`}
                    onClick={() =>
                      setAssets((old) =>
                        old.filter((item) => item.address !== asset.address),
                      )
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <p className={s.fieldHelp}>
              Select up to six markets. A fresh proposal calculates reserves and
              ranges from current prices and routes. You can edit the proposed
              pair amounts and ranges before execution.
            </p>
            <div className={s.subheading}>
              <h3>Management limits</h3>
              <ShieldCheck size={16} />
            </div>
            <div className={s.fieldGrid}>
              <label className={s.field}>
                Review interval
                <select
                  value={interval}
                  onChange={(e) => setInterval(e.target.value)}
                >
                  {[5, 15, 30].map((value) => (
                    <option key={value} value={value}>
                      Every {value} minutes
                    </option>
                  ))}
                </select>
              </label>
              <label className={s.field}>
                Holding period, days
                <input
                  type="number"
                  min="0.1"
                  max="365"
                  step="0.1"
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                />
              </label>
              <label className={s.field}>
                Native gas reserve
                <input
                  inputMode="decimal"
                  value={reserve}
                  onChange={(e) => setReserve(e.target.value)}
                />
              </label>
              <div className={s.field}>
                Execution mode
                <div className={s.readonly}>
                  <LockKeyhole size={14} />
                  Manual approval
                </div>
              </div>
            </div>
            <div className={s.actions}>
              <button className={s.back} onClick={navigation.back}>
                <ArrowLeft size={15} />
                Back
              </button>
              <button
                className={s.primary}
                disabled={!session}
                onClick={review}
              >
                Review strategy
                <ArrowRight size={16} />
              </button>
            </div>
          </>
        ) : (
          <>
            <div className={s.reviewHero}>
              <span className={s.tag}>
                {custom ? "Custom LP strategy" : name}
              </span>
              <h2>{name}</h2>
              <strong>
                {amount} <span>{funding.symbol}</span>
              </strong>
              <p>
                Shared funding budget, subject to fresh balance and route checks
              </p>
            </div>
            <div className={s.allocationRows}>
              {assets.map((asset) => (
                <div key={asset.address}>
                  <strong>
                    {funding.symbol} / {asset.symbol}
                  </strong>
                  <span>Allocation pending analysis</span>
                </div>
              ))}
            </div>
            <dl className={s.facts}>
              <div>
                <dt>Review interval</dt>
                <dd>Every {interval} minutes</dd>
              </div>
              <div>
                <dt>Holding period</dt>
                <dd>{days} days</dd>
              </div>
              <div>
                <dt>Native gas reserve</dt>
                <dd>
                  {reserve}{" "}
                  {networks.find((chain) => chain.id === chainId)?.symbol}
                </dd>
              </div>
              <div>
                <dt>Network</dt>
                <dd>{networks.find((chain) => chain.id === chainId)?.name}</dd>
              </div>
              <div>
                <dt>Execution mode</dt>
                <dd>Manual confirmation</dd>
              </div>
            </dl>
            <div className={s.warning}>
              <ShieldCheck size={18} />
              <div>
                <strong>Know what you are approving</strong>
                <p>
                  This requests a proposal, not a transaction. Inspect the
                  proposed reserves, ranges, slippage and action limits before
                  preparing an execution plan. Shared reserves compete across
                  pairs.
                </p>
              </div>
            </div>
            <label className={s.checkbox}>
              <input
                type="checkbox"
                checked={acknowledged}
                disabled={busy}
                onChange={(e) => setAcknowledged(e.target.checked)}
              />
              <span>
                I understand the inventory risks and will review the proposed
                parameters before approving transactions.
              </span>
            </label>
            <div className={s.actions}>
              <button
                className={s.back}
                disabled={busy}
                onClick={() => {
                  setReviewing(false);
                  navigation.edit();
                }}
              >
                <ArrowLeft size={15} />
                Back
              </button>
              <button
                className={s.primary}
                disabled={busy || !acknowledged || !session}
                onClick={() => void submit()}
              >
                {busy
                  ? "Analyzing current wallet..."
                  : "Generate fresh proposal"}
                <ArrowRight size={16} />
              </button>
            </div>
          </>
        )}
        <RouteChecks checks={checks} />
        {error && (
          <p className={s.error} role="alert">
            {error}
          </p>
        )}
        {!session && (
          <p className={s.fieldHelp}>
            Connect and authenticate your wallet above to review this strategy.
          </p>
        )}
      </section>
      <aside className={s.sidebar}>
        <section className={s.previewPanel}>
          <span className={s.eyebrow}>
            {reviewing ? "WHAT HAPPENS NEXT" : "YOUR STRATEGY AT A GLANCE"}
          </span>
          <h2>{name}</h2>
          <dl className={s.facts}>
            <div>
              <dt>Base inventory</dt>
              <dd>
                {amount || "0"} {funding.symbol}
              </dd>
            </div>
            <div>
              <dt>Markets</dt>
              <dd>{assets.length} pairs</dd>
            </div>
            <div>
              <dt>Approval</dt>
              <dd>Every transaction</dd>
            </div>
          </dl>
          <ol className={s.timeline}>
            {[
              [
                "Analyze current inventory",
                "Verify token metadata, execution routes and wallet balances.",
              ],
              [
                "Review the proposal",
                "Inspect and edit exact pair reserves and price ranges. Slippage and action limits appear in the proposed policy.",
              ],
              [
                "Approve an execution plan",
                "Only a separately confirmed plan can submit transactions. Creating a proposal does not start management.",
              ],
            ].map(([title, text], i) => (
              <li key={title}>
                <span>{i + 1}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
        <section className={s.safetyCard}>
          <ShieldCheck size={22} />
          <h3>Defined limits, no surprises.</h3>
          <p>
            Proposals use current data. No sample prices, balances or simulated
            positions are used here.
          </p>
        </section>
        <div className={s.riskNote}>
          <ShieldCheck size={17} />
          <p>
            Recurring reviews require an active browser session. Stopping
            management does not withdraw liquidity.
          </p>
        </div>
      </aside>
    </div>
  );
}
