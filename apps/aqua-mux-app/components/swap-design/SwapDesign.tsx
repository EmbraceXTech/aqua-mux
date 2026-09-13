"use client";

import { useState } from "react";
import {
  ArrowDownUp,
  ArrowRight,
  Check,
  ChevronDown,
  GitMerge,
  GitBranch,
  Info,
  Layers3,
  Plus,
  Search,
  Settings2,
  Wallet,
  X,
} from "lucide-react";
import { MainLayout } from "@/components/layouts/MainLayout";
import { Modal } from "@/components/ui/modal";
import { useLiveSwap } from "@/hooks/useLiveSwap";
import {
  getToken,
  initialDrafts,
  liveTokens,
  row,
  SWAP_CHAIN,
  V3_ROUTER,
  type Draft,
  type LiveQuote,
  type Mode,
  type Row,
  type Side,
  type Symbol,
} from "@/lib/live-swap";
import styles from "./swap-design.module.css";

function TokenMark({
  symbol,
  small = false,
}: {
  symbol: Symbol;
  small?: boolean;
}) {
  const token = getToken(symbol);
  return (
    <span
      aria-hidden="true"
      className={`${styles.tokenMark} ${small ? styles.smallMark : ""}`}
      style={{ background: token.color }}
    >
      {token.mark}
    </span>
  );
}
function rebalance(items: Row[]) {
  return items.map((item, index) => ({
    ...item,
    weight: String(
      index === items.length - 1
        ? 100 - Math.floor(100 / items.length) * index
        : Math.floor(100 / items.length),
    ),
  }));
}
export function SwapDesign() {
  const [mode, setMode] = useState<Mode>("multi-out");
  const [drafts, setDrafts] = useState(initialDrafts);
  const [slippage, setSlippage] = useState("0.5");
  const [settings, setSettings] = useState(false);
  const [picker, setPicker] = useState<{ side: Side; index?: number } | null>(
    null,
  );
  const [search, setSearch] = useState("");
  const [review, setReview] = useState<{ quote: LiveQuote; account: string }>();
  const draft = drafts[mode];
  const multi: Side = mode === "multi-in" ? "input" : "output";
  const singleSwap = draft.input.length === 1 && draft.output.length === 1;
  const validSlippage =
    /^\d+(\.\d{1,2})?$/.test(slippage) &&
    Number(slippage) >= 0.01 &&
    Number(slippage) <= 5;
  const request = {
    chainId: SWAP_CHAIN,
    mode,
    draft,
    slippageBps: validSlippage ? Math.round(Number(slippage) * 100) : 0,
  } as const;
  const trade = useLiveSwap(request);
  const quote = trade.quote;
  const approvals = trade.approvalsFor(review?.quote);
  const locked = trade.busy || !!trade.pending || trade.unknown;
  const reviewValid =
    review &&
    review.account === trade.account &&
    JSON.stringify(review.quote.request) === JSON.stringify(request) &&
    trade.clock > 0 &&
    review.quote.expiresAt > trade.clock;
  function update(next: Draft) {
    setReview(undefined);
    setDrafts((previous) => ({ ...previous, [mode]: next }));
  }
  function patch(side: Side, index: number, values: Partial<Row>) {
    update({
      ...draft,
      [side]: draft[side].map((item, i) =>
        i === index ? { ...item, ...values } : item,
      ),
    });
  }
  function setExact(side: Side) {
    if (side === draft.exact) return;
    update({
      ...draft,
      exact: side,
      [side]: draft[side].map((item, i) => ({
        ...item,
        amount: trade.fresh ? quote!.amounts[side][i] : "",
      })),
    });
  }
  function openPicker(side: Side, index?: number) {
    setSearch("");
    setPicker({ side, index });
  }
  function pickToken(symbol: Symbol) {
    if (!picker) return;
    if (picker.index !== undefined)
      patch(picker.side, picker.index, { symbol, amount: "" });
    else
      update({
        ...draft,
        [picker.side]: rebalance([...draft[picker.side], row(symbol)]),
      });
    setPicker(null);
  }
  const available = liveTokens.filter((token) =>
    `${token.symbol} ${token.name} ${token.address}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  function tokenSection(side: Side) {
    const isMulti = multi === side;
    const exact = draft.exact === side;
    return (
      <section
        className={`${styles.tokenSection} ${draft[side].length === 1 ? styles.singleSide : ""}`}
        aria-label={side === "input" ? "Input tokens" : "Output tokens"}
      >
        <div className={styles.sectionHeading}>
          <div>
            <h2>{side === "input" ? "You pay" : "You receive"}</h2>
            <span className={styles.count}>
              {draft[side].length}{" "}
              {draft[side].length === 1 ? "token" : "tokens"}
            </span>
          </div>
          <span className={exact ? styles.exactBadge : styles.estimateBadge}>
            {exact ? <Check size={11} /> : "≈"}{" "}
            {exact ? "Exact amounts" : "Estimated amounts"}
          </span>
        </div>
        <div className={styles.tokenRows}>
          {draft[side].map((item, index) => {
            const token = getToken(item.symbol);
            const amount = exact
              ? item.amount
              : (quote?.amounts[side][index] ?? "");
            const balance = trade.holdings[item.symbol]?.balance;
            return (
              <div key={item.symbol} className={styles.tokenRow}>
                <div className={styles.rowMain}>
                  <button
                    className={styles.tokenSelector}
                    disabled={locked}
                    aria-label={`Select ${side} token ${index + 1}: ${item.symbol}`}
                    onClick={() => openPicker(side, index)}
                  >
                    <TokenMark symbol={item.symbol} />
                    <span>
                      <strong>{item.symbol}</strong>
                      <small>{token.name}</small>
                    </span>
                    <ChevronDown size={14} />
                  </button>
                  <div className={styles.amountBox}>
                    <input
                      aria-label={`${side} ${item.symbol} amount`}
                      inputMode="decimal"
                      placeholder="0.00"
                      readOnly={!exact || locked}
                      value={amount}
                      onChange={(event) =>
                        patch(side, index, { amount: event.target.value })
                      }
                    />
                    <small>
                      {exact
                        ? "Exact token amount"
                        : trade.quoteBusy
                          ? "Fetching pool quote…"
                          : quote
                            ? trade.fresh
                              ? "Live pool quote"
                              : "Quote expired"
                            : "Awaiting quote"}
                    </small>
                  </div>
                  {isMulti && draft[side].length > 1 && (
                    <button
                      disabled={locked}
                      className={styles.remove}
                      aria-label={`Remove ${side} ${item.symbol}`}
                      onClick={() =>
                        update({
                          ...draft,
                          [side]: rebalance(
                            draft[side].filter((_, i) => i !== index),
                          ),
                        })
                      }
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
                <div className={styles.rowMeta}>
                  <span>
                    Balance:{" "}
                    {trade.account
                      ? (balance ?? "Unavailable")
                      : "Connect wallet"}
                    {side === "input" &&
                      exact &&
                      balance !== undefined &&
                      item.symbol !== "ETH" && (
                        <button
                          disabled={locked}
                          onClick={() =>
                            patch(side, index, { amount: balance })
                          }
                        >
                          Max
                        </button>
                      )}
                  </span>
                  {isMulti && draft[side].length > 1 && !exact && (
                    <label className={styles.allocation}>
                      Allocation{" "}
                      <input
                        disabled={locked}
                        aria-label={`${item.symbol} allocation percent`}
                        inputMode="decimal"
                        value={item.weight}
                        onChange={(event) =>
                          patch(side, index, { weight: event.target.value })
                        }
                      />
                      %
                    </label>
                  )}
                </div>
                {isMulti && (
                  <div className={styles.rowFee}>
                    <span>
                      <Settings2 size={12} /> {item.symbol} pool fee
                    </span>
                    <div className={styles.feePresets}>
                      {(["0.01", "0.05", "0.3", "1"] as const).map((fee) => (
                        <button
                          key={fee}
                          disabled={locked}
                          className={item.fee === fee ? styles.activeFee : ""}
                          aria-pressed={item.fee === fee}
                          aria-label={`${item.symbol} fee ${fee}%`}
                          onClick={() => patch(side, index, { fee })}
                        >
                          {fee}%
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {isMulti && (
          <button
            className={styles.addToken}
            disabled={
              locked ||
              draft.input.length + draft.output.length >= liveTokens.length
            }
            onClick={() => openPicker(side)}
          >
            <Plus size={15} /> Add {side} token{" "}
            <span>
              {draft[side].length} / {liveTokens.length - 1}
            </span>
          </button>
        )}
        <div className={styles.sectionTotal}>
          <span>
            {side === "input"
              ? "Spend limits include slippage"
              : "Pool fees included in quotes"}
          </span>
        </div>
      </section>
    );
  }
  const canReview =
    trade.fresh &&
    !trade.quoteBusy &&
    !locked &&
    !trade.insufficient.length &&
    trade.walletChain === SWAP_CHAIN;
  return (
    <div className={styles.page}>
      <MainLayout activePage="swap">
        <div className={styles.container}>
          <div className={styles.prototypeBar}>
            <span>
              <Info size={13} /> Arbitrum mainnet. Real funds. Direct Uniswap v3
              pools.
            </span>
            <span>Approvals may require separate transactions.</span>
          </div>
          <div className={styles.intro}>
            <div className={styles.eyebrow}>MULTI-TOKEN SWAPS</div>
            <h1>
              Your tokens. <span>Your direction.</span>
            </h1>
            <p>
              Swap one token, consolidate balances, or split into a basket. You
              choose the amounts.
            </p>
          </div>
          <div className={styles.workspace}>
            <section
              className={styles.composer}
              aria-label="Multi-swap builder"
            >
              <div className={styles.composerHeader}>
                <span>
                  <ArrowDownUp size={17} />{" "}
                  {singleSwap ? "Single swap" : "Multi-swap"}
                </span>
                <button
                  disabled={locked}
                  className={styles.slippageButton}
                  onClick={() => setSettings(true)}
                >
                  <Settings2 size={14} />
                  {slippage || "0"}% slippage{" "}
                  <span className={styles.globalTag}>Global</span>
                </button>
              </div>
              <div className={styles.builderControls}>
                <div
                  className={styles.modeSwitch}
                  role="group"
                  aria-label="Swap mode"
                >
                  {(["multi-in", "multi-out"] as const).map((value) => (
                    <button
                      key={value}
                      disabled={locked}
                      aria-pressed={mode === value}
                      className={mode === value ? styles.activeMode : ""}
                      onClick={() => {
                        setReview(undefined);
                        setMode(value);
                      }}
                    >
                      {value === "multi-in" ? (
                        <GitMerge size={18} />
                      ) : (
                        <GitBranch size={18} />
                      )}
                      <span>
                        <strong>
                          {value === "multi-in"
                            ? "Multiple in"
                            : "Multiple out"}
                        </strong>
                        <small>
                          {value === "multi-in"
                            ? "One or more → one token"
                            : "One token → one or more"}
                        </small>
                      </span>
                      {mode === value && (
                        <span className={styles.modeCheck}>
                          <Check size={11} />
                        </span>
                      )}
                    </button>
                  ))}
                </div>
                <div className={styles.amountSettings}>
                  <div className={styles.exactControl}>
                    <span>Set amounts for</span>
                    <div>
                      {(["input", "output"] as const).map((side) => (
                        <button
                          key={side}
                          disabled={locked}
                          aria-pressed={draft.exact === side}
                          className={
                            draft.exact === side ? styles.selectedExact : ""
                          }
                          onClick={() => setExact(side)}
                        >
                          {side === "input" ? "You pay" : "You receive"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className={styles.amountHint}>
                    {draft.exact === "input"
                      ? "Fix what you spend. We'll quote what you receive."
                      : "Fix what you receive. We'll quote the maximum spend."}
                    {mode === "multi-in" && draft.exact === "output"
                      ? " Allocation splits the requested output between input routes."
                      : ""}
                  </p>
                </div>
              </div>
              <div className={styles.tokenColumns}>
                {tokenSection("input")}
                <div className={styles.direction} aria-hidden="true">
                  <ArrowRight size={18} />
                </div>
                {tokenSection("output")}
              </div>
              <div className={styles.atomic}>
                <Layers3 size={13} />
                <span>
                  {singleSwap
                    ? "One swap. One transaction."
                    : "All swap legs execute together or revert."}
                </span>
                <span className={styles.simulated}>Live</span>
              </div>
              <p className={styles.noWallet}>
                Only direct pools at your chosen fee tier are quoted. No
                best-price aggregation. Keep ETH for gas.
              </p>
              {(trade.quoteError ||
                trade.error ||
                trade.insufficient.length > 0) && (
                <div role="alert" className={styles.errors}>
                  {[trade.quoteError, trade.error, ...trade.insufficient]
                    .filter(Boolean)
                    .map((text, i) => (
                      <p key={i}>{text}</p>
                    ))}
                </div>
              )}
              {trade.pending && (
                <p role="status" className={styles.settingsNote}>
                  {trade.unlocated
                    ? "Wallet returned a hash, but the transaction is not visible on Arbitrum. It may have failed before broadcast or been dropped. Check MetaMask activity. We are still checking; do not retry."
                    : `${trade.pending.label} pending.`}{" "}
                  <a
                    href={`https://arbiscan.io/tx/${trade.pending.hash}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View transaction
                  </a>
                  . Keep this page open. No retries while pending.
                </p>
              )}
              {trade.result && (
                <p role="status" className={styles.settingsNote}>
                  {trade.result.label}{" "}
                  {trade.result.success ? "confirmed" : "reverted"}.{" "}
                  <a
                    href={`https://arbiscan.io/tx/${trade.result.hash}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View receipt
                  </a>
                </p>
              )}
              {trade.unknown && (
                <p role="alert" className={styles.errors}>
                  Submission status is unknown. Check MetaMask activity before
                  any further trade. Sending is disabled.
                </p>
              )}
              {!trade.account ? (
                <button
                  className={styles.primaryButton}
                  disabled={locked}
                  onClick={() => void trade.connect()}
                >
                  Connect wallet <Wallet size={17} />
                </button>
              ) : trade.walletChain !== SWAP_CHAIN ? (
                <button
                  disabled={locked}
                  className={styles.primaryButton}
                  onClick={() => void trade.switchChain()}
                >
                  Switch wallet to Arbitrum
                </button>
              ) : (
                <button
                  className={styles.primaryButton}
                  disabled={!canReview}
                  onClick={() =>
                    setReview({ quote: quote!, account: trade.account! })
                  }
                >
                  {trade.quoteBusy
                    ? "Fetching quote…"
                    : trade.busy
                      ? "Check wallet…"
                      : "Review swap"}
                  <ArrowRight size={17} />
                </button>
              )}
              <button
                className={styles.backButton}
                disabled={locked || trade.quoteBusy}
                onClick={() => {
                  setReview(undefined);
                  trade.refresh();
                }}
              >
                Refresh quote and balances
              </button>
              {quote && (
                <p className={styles.noWallet}>
                  {trade.fresh
                    ? `Quote expires in ${Math.max(0, Math.ceil((quote.expiresAt - trade.clock) / 1000))}s`
                    : "Quote expired. Refresh before reviewing."}{" "}
                  · Block {quote.block}
                </p>
              )}
            </section>
          </div>
        </div>
      </MainLayout>
      <Modal
        open={!!picker}
        onOpenChange={(open) => {
          if (!open) setPicker(null);
        }}
        title={`Select ${picker?.side || "input"} token`}
        description="Verified Arbitrum token addresses. Pool availability depends on the fee tier."
      >
        <div className={styles.dialogContent}>
          <label className={styles.search}>
            <Search size={17} />
            <input
              autoFocus
              aria-label="Search tokens"
              placeholder="Search name, symbol, or address"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <div className={styles.pickerList}>
            {available.map((token) => {
              const used = [...draft.input, ...draft.output].some(
                (item) => item.symbol === token.symbol,
              );
              return (
                <button
                  key={token.symbol}
                  disabled={used || locked}
                  onClick={() => pickToken(token.symbol)}
                >
                  <TokenMark symbol={token.symbol} />
                  <span>
                    <strong>{token.symbol}</strong>
                    <small>{token.name}</small>
                    <small title={token.address}>
                      {token.address.slice(0, 6)}…{token.address.slice(-4)}
                    </small>
                  </span>
                  <span>
                    <strong>
                      {used
                        ? "Already selected"
                        : (trade.holdings[token.symbol]?.balance ??
                          "Unavailable")}
                    </strong>
                  </span>
                </button>
              );
            })}
            {!available.length && (
              <p className={styles.empty}>No matching supported token.</p>
            )}
          </div>
        </div>
      </Modal>
      <Modal
        open={settings}
        onOpenChange={setSettings}
        title="Global slippage"
        description="A minimum receive or maximum spend limit for every swap leg."
      >
        <div className={styles.dialogContent}>
          <div className={styles.slippageOptions}>
            {["0.1", "0.5", "1"].map((value) => (
              <button
                key={value}
                disabled={locked}
                aria-pressed={slippage === value}
                className={slippage === value ? styles.selectedExact : ""}
                onClick={() => {
                  setReview(undefined);
                  setSlippage(value);
                }}
              >
                {value}%
              </button>
            ))}
            <label>
              <input
                disabled={locked}
                aria-label="Custom global slippage percent"
                inputMode="decimal"
                value={slippage}
                onChange={(event) => {
                  setReview(undefined);
                  setSlippage(event.target.value);
                }}
              />
              %
            </label>
          </div>
          {!validSlippage ? (
            <p role="alert" className={styles.errorText}>
              Enter 0.01% to 5%, with up to two decimal places.
            </p>
          ) : Number(slippage) > 1 ? (
            <p className={styles.warning}>
              High slippage allows a less favorable execution price.
            </p>
          ) : (
            <p className={styles.settingsNote}>
              If any leg exceeds its limit, the entire swap reverts.
            </p>
          )}
          <div className={styles.settingsInfo}>
            <Info size={16} />
            <p>
              Each {multi} token selects a Uniswap v3 pool fee tier. Fees go to
              the pool, not AquaMux.
            </p>
          </div>
          <button
            className={styles.primaryButton}
            disabled={!validSlippage}
            onClick={() => setSettings(false)}
          >
            Done <Check size={16} />
          </button>
        </div>
      </Modal>
      <Modal
        open={!!review}
        onOpenChange={(open) => {
          if (!open && !trade.busy) setReview(undefined);
        }}
        title="Review your swap"
        description="Real transaction on Arbitrum One, chain ID 42161. Confirm each action in your wallet."
      >
        {review && (
          <div className={styles.dialogContent}>
            {(["input", "output"] as const).map((side) => (
              <div className={styles.reviewGroup} key={side}>
                <h3>
                  {side === "input" ? "You pay" : "You receive"}
                  <span>
                    {review.quote.request.draft.exact === side
                      ? "Exact"
                      : "Estimated"}
                  </span>
                </h3>
                {review.quote.request.draft[side].map((item, index) => (
                  <div key={item.symbol}>
                    <TokenMark symbol={item.symbol} small />
                    <strong>
                      {review.quote.amounts[side][index]} {item.symbol}
                    </strong>
                  </div>
                ))}
                {review.quote.request.draft.exact !== side &&
                  review.quote.request.draft[side].map((item, index) => (
                    <p className={styles.settingsNote} key={item.symbol}>
                      {side === "input" ? "Maximum spend" : "Minimum receive"}:{" "}
                      {review.quote.limits[side][index]} {item.symbol}
                    </p>
                  ))}
              </div>
            ))}
            <div className={styles.reviewFees}>
              <strong>Pool routes</strong>
              {review.quote.legs.map((l) => (
                <span key={`${l.input}-${l.output}`}>
                  {l.input} → {l.output}
                  <b>{l.fee / 10000}%</b>
                </span>
              ))}
              <span>
                Global slippage<b>{review.quote.request.slippageBps / 100}%</b>
              </span>
            </div>
            <p className={styles.settingsNote}>
              Recipient: {review.account}
              <br />
              Router:{" "}
              <a
                href={`https://arbiscan.io/address/${V3_ROUTER}`}
                target="_blank"
                rel="noreferrer"
              >
                {V3_ROUTER}
              </a>
              <br />
              Method: multicall. Network gas is additional and shown by
              MetaMask. Exact-output swaps refund unused ETH. The router
              deadline is 10 minutes from preparation. Reject an expired wallet
              request; do not confirm it.
            </p>
            {trade.error && (
              <p role="alert" className={styles.errorText}>
                {trade.error}
              </p>
            )}
            {trade.awaitingWallet ? (
              <p role="status" className={styles.settingsNote}>
                {trade.awaitingWallet.deadline &&
                trade.clock >= trade.awaitingWallet.deadline
                  ? "The transaction deadline has passed. Reject this request in MetaMask. Confirming it now cannot complete the swap."
                  : `Waiting for your wallet decision.${trade.awaitingWallet.deadline ? ` Confirm within ${Math.max(0, Math.ceil((trade.awaitingWallet.deadline - trade.clock) / 1000))} seconds or reject the request.` : ""} No additional request will be sent automatically.`}
              </p>
            ) : trade.pending ? (
              <p role="status" className={styles.settingsNote}>
                {trade.pending.label} pending.{" "}
                <a
                  href={`https://arbiscan.io/tx/${trade.pending.hash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View transaction
                </a>
              </p>
            ) : !reviewValid ? (
              <>
                <p role="alert" className={styles.warning}>
                  Review expired or wallet changed. Refresh for current amounts
                  and limits.
                </p>
                <button
                  className={styles.primaryButton}
                  disabled={locked}
                  onClick={() => {
                    setReview(undefined);
                    trade.refresh();
                  }}
                >
                  Refresh quote
                </button>
              </>
            ) : approvals.length ? (
              <>
                <p className={styles.settingsNote}>
                  {approvals[0].reset
                    ? `Reset the existing ${approvals[0].symbol} allowance to zero first.`
                    : `Approve only the reviewed maximum ${approvals[0].symbol} spend.`}{" "}
                  Spender: {V3_ROUTER}. Approval is separate from the swap.
                  Refresh and review after confirmation.
                </p>
                <button
                  className={styles.primaryButton}
                  disabled={locked || trade.walletChain !== SWAP_CHAIN}
                  onClick={async () => {
                    if (await trade.send(review.quote, approvals[0]))
                      setReview(undefined);
                  }}
                >
                  {trade.busy
                    ? "Check wallet…"
                    : `${approvals[0].reset ? "Reset" : "Approve"} ${approvals[0].symbol} in wallet`}
                </button>
              </>
            ) : (
              <button
                className={styles.primaryButton}
                disabled={
                  locked ||
                  trade.insufficient.length > 0 ||
                  trade.walletChain !== SWAP_CHAIN
                }
                onClick={async () => {
                  if (await trade.send(review.quote)) setReview(undefined);
                }}
              >
                {trade.busy ? "Check wallet…" : "Confirm swap in wallet"}
                <ArrowRight size={17} />
              </button>
            )}
            <button
              className={styles.backButton}
              disabled={trade.busy}
              onClick={() => setReview(undefined)}
            >
              Back to editing
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
