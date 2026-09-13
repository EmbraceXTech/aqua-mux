import { Check, Plus, SlidersHorizontal, X } from "lucide-react";
import {
  allocationTotal,
  customValidation,
  quoteTokens,
  splitEqually,
  triggerLabel,
  type CustomSettings,
} from "./custom-strategy";
import s from "./strategy-design.module.css";
import c from "./custom-strategy.module.css";

export function CustomEntry({ onStart }: { onStart: () => void }) {
  return (
    <section className={c.entry}>
      <span className={s.recipeIcon}>
        <SlidersHorizontal size={23} />
      </span>
      <div>
        <span className={s.eyebrow}>BUILD YOUR OWN</span>
        <h3>A different plan in mind?</h3>
        <p>
          Choose your markets and define when a range change should be reviewed.
        </p>
      </div>
      <button className={s.secondary} onClick={onStart}>
        <Plus size={16} />
        Build custom strategy
      </button>
    </section>
  );
}

export function CustomMarkets({
  value,
  onChange,
}: {
  value: CustomSettings;
  onChange: (value: CustomSettings) => void;
}) {
  const error = customValidation(value);
  return (
    <section className={c.section} aria-labelledby="custom-markets-title">
      <div className={c.title}>
        <span>01</span>
        <div>
          <h3 id="custom-markets-title">Choose your markets</h3>
          <p>One WETH inventory. Up to four quote tokens on Arbitrum.</p>
        </div>
      </div>
      <div className={c.tokenChoices}>
        {quoteTokens.map((symbol) => {
          const selected = value.markets.some(
            (market) => market.symbol === symbol,
          );
          return (
            <button
              key={symbol}
              aria-pressed={selected}
              className={selected ? c.chosen : ""}
              onClick={() =>
                onChange({
                  ...value,
                  markets: selected
                    ? value.markets.filter((market) => market.symbol !== symbol)
                    : [
                        ...value.markets,
                        { symbol, weight: value.markets.length ? 0 : 100 },
                      ],
                })
              }
            >
              {selected ? <Check size={14} /> : <Plus size={14} />}
              {symbol}
            </button>
          );
        })}
      </div>
      <div className={c.allocationHeading}>
        <strong>Virtual allocations</strong>
        <button
          className={s.textButton}
          disabled={!value.markets.length}
          onClick={() =>
            onChange({ ...value, markets: splitEqually(value.markets) })
          }
        >
          Split equally
        </button>
      </div>
      <div className={c.markets}>
        {value.markets.map((market) => (
          <div key={market.symbol}>
            <span className={s.coin}>Ξ</span>
            <strong>WETH / {market.symbol}</strong>
            <label>
              <span className={c.srOnly}>
                {market.symbol} allocation percent
              </span>
              <input
                type="number"
                min="1"
                max="100"
                step="1"
                value={market.weight || ""}
                placeholder="0"
                onChange={(e) =>
                  onChange({
                    ...value,
                    markets: value.markets.map((item) =>
                      item.symbol === market.symbol
                        ? { ...item, weight: Number(e.target.value) }
                        : item,
                    ),
                  })
                }
                aria-invalid={!!error}
                aria-describedby="custom-allocation-help"
              />
              <span>%</span>
            </label>
            <button
              className={c.remove}
              aria-label={`Remove ${market.symbol} market`}
              onClick={() =>
                onChange({
                  ...value,
                  markets: value.markets.filter(
                    (item) => item.symbol !== market.symbol,
                  ),
                })
              }
            >
              <X size={15} />
            </button>
          </div>
        ))}
      </div>
      <div className={c.total}>
        <span>Allocation total</span>
        <strong className={error ? s.error : s.green}>
          {allocationTotal(value)}% / 100%
        </strong>
      </div>
      <p
        id="custom-allocation-help"
        className={error ? s.error : s.fieldHelp}
        aria-live="polite"
      >
        {error ||
          "Fully allocated. Virtual weights do not duplicate your real inventory."}
      </p>
    </section>
  );
}

export function CustomTriggers({
  value,
  onChange,
}: {
  value: CustomSettings;
  onChange: (value: CustomSettings) => void;
}) {
  return (
    <section className={c.section} aria-labelledby="custom-triggers-title">
      <div className={c.title}>
        <span>03</span>
        <div>
          <h3 id="custom-triggers-title">Decide when to review</h3>
          <p>Signals are evaluated during scheduled browser reviews.</p>
        </div>
      </div>
      <div className={c.triggers}>
        <label>
          <input
            type="checkbox"
            checked={value.rangeExit}
            onChange={(e) =>
              onChange({ ...value, rangeExit: e.target.checked })
            }
          />
          <span>
            <strong>Price leaves the range</strong>
            <small>
              Review a position when its reference price moves outside the
              bounds.
            </small>
          </span>
        </label>
        <label>
          <input
            type="checkbox"
            checked={value.inventoryDrift}
            onChange={(e) =>
              onChange({ ...value, inventoryDrift: e.target.checked })
            }
          />
          <span>
            <strong>Inventory drifts from target</strong>
            <small>
              Review when inventory differs from the intended allocation.
            </small>
          </span>
        </label>
      </div>
      <div className={s.fieldGrid}>
        <label className={s.field}>
          Inventory drift threshold
          <select
            disabled={!value.inventoryDrift}
            value={value.driftPercent}
            onChange={(e) =>
              onChange({ ...value, driftPercent: Number(e.target.value) })
            }
          >
            <option value="5">5%</option>
            <option value="10">10%</option>
            <option value="20">20%</option>
          </select>
        </label>
        <label className={s.field}>
          Action cooldown
          <select
            value={value.cooldown}
            onChange={(e) => onChange({ ...value, cooldown: e.target.value })}
          >
            <option value="15">15 minutes</option>
            <option value="30">30 minutes</option>
            <option value="60">60 minutes</option>
          </select>
        </label>
      </div>
      <p className={s.fieldHelp}>
        Triggers request a review, not an automatic trade. Cooldown is the
        minimum time between proposed changes. Every transaction still needs
        your approval.
      </p>
    </section>
  );
}

export function CustomSummary({
  value,
  behavior,
}: {
  value: CustomSettings;
  behavior: string;
}) {
  return (
    <div className={c.summary}>
      <span className={s.eyebrow}>YOUR CUSTOM RULES</span>
      <dl className={s.facts}>
        <div>
          <dt>Range behavior</dt>
          <dd>{behavior}</dd>
        </div>
        <div>
          <dt>Review signals</dt>
          <dd>{triggerLabel(value)}</dd>
        </div>
        <div>
          <dt>Action cooldown</dt>
          <dd>{value.cooldown} minutes</dd>
        </div>
      </dl>
    </div>
  );
}
