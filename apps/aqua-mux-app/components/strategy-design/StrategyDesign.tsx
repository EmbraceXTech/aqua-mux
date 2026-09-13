"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Activity,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  Clock3,
  FlaskConical,
  Layers3,
  LockKeyhole,
  Pause,
  Play,
  Plus,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Waves,
} from "lucide-react";
import { MainLayout } from "@/components/layouts/MainLayout";
import s from "./strategy-design.module.css";
import c from "./custom-strategy.module.css";
import {
  CustomEntry,
  CustomMarkets,
  CustomTriggers,
  CustomSummary,
} from "./CustomStrategyBuilder";
import {
  customValidation,
  newCustomSettings,
  type CustomSettings,
} from "./custom-strategy";

const recipes = [
  {
    id: "wide",
    name: "Wide-range LP",
    tag: "Less hands-on",
    icon: Waves,
    description:
      "Give your liquidity more room to move. Keep a broad range and review it on your terms.",
    range: "Broad",
    management: "Monitor & review",
    risk: "Price changes can reduce inventory value, even within a broad range.",
  },
  {
    id: "managed",
    name: "Concentrated LP",
    tag: "Active management",
    icon: Layers3,
    description:
      "Concentrate liquidity around the market. Review a new range when the price moves.",
    range: "Focused",
    management: "Propose range changes",
    risk: "Liquidity becomes inactive outside its range. Replacing a range costs gas.",
  },
  {
    id: "upward",
    name: "Upward-only LP",
    tag: "Directional",
    icon: ArrowUpRight,
    description:
      "Follow upward price moves with defined limits. Hold your range when the market falls.",
    range: "Directional",
    management: "Recenter upward only",
    risk: "An upward-only rule does not prevent losses and may leave liquidity inactive.",
  },
] as const;
type RecipeId = (typeof recipes)[number]["id"];
type Config = {
  recipe: RecipeId;
  name: string;
  amount: string;
  weight: number;
  width: number;
  interval: string;
  slippage: string;
  budget: string;
  custom?: CustomSettings;
};
type Position = {
  config: Config;
  status: "running" | "paused" | "stopped";
  events: string[];
};
const initial: Config = {
  recipe: "managed",
  name: "My ETH strategy",
  amount: "2",
  weight: 65,
  width: 15,
  interval: "15",
  slippage: "0.5",
  budget: "10",
};
const money = (value: number) =>
  value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
const getRecipe = (id: RecipeId) => recipes.find((r) => r.id === id)!;
const strategyName = (config: Config) =>
  config.custom ? "Custom LP strategy" : getRecipe(config.recipe).name;
const marketsFor = (config: Config) =>
  config.custom?.markets ?? [
    { symbol: "USDC", weight: config.weight },
    { symbol: "ARB", weight: 100 - config.weight },
  ];

function AllocationSummary({ config }: { config: Config }) {
  return (
    <div className={s.allocationRows}>
      {marketsFor(config).map((market) => (
        <div key={market.symbol}>
          <Pair second={market.symbol} />
          <strong>{market.weight}%</strong>
        </div>
      ))}
    </div>
  );
}

function Pair({ second = "USDC" }: { second?: string }) {
  return (
    <span className={s.pair}>
      <span className={s.coin}>Ξ</span>
      <span className={`${s.coin} ${second === "USDC" ? s.usdc : s.arb}`}>
        {second === "USDC" ? "$" : second === "wstETH" ? "S" : second.charAt(0)}
      </span>
      <strong>WETH / {second}</strong>
    </span>
  );
}

function RangeGraphic({
  kind,
  width = kind === "wide" ? 40 : 15,
}: {
  kind: RecipeId;
  width?: number;
}) {
  return (
    <div className={`${s.rangeGraphic} ${s[kind]}`} aria-hidden="true">
      <div className={s.rangeGrid} />
      <div
        className={s.rangeBand}
        style={{
          width: `${Math.min(92, 22 + width * 1.4)}%`,
        }}
      >
        <span />
        <span />
      </div>
      <div className={s.bars}>
        {Array.from({ length: 31 }, (_, i) => (
          <i
            key={i}
            style={{
              height: `${12 + Math.round(63 * Math.exp(-((i - 15) ** 2) / 53)) + (i % 3) * 4}%`,
            }}
          />
        ))}
      </div>
      <div className={s.marketLine}>
        <span />
      </div>
    </div>
  );
}

export type LiveStrategyDesign = {
  wallet: ReactNode;
  walletLabel: string;
  status?: ReactNode;
  count: number;
  positions: ReactNode;
  configure: (
    recipe: RecipeId,
    custom: boolean,
    navigation: {
      back: () => void;
      review: () => void;
      edit: () => void;
      created: () => void;
    },
  ) => ReactNode;
};

export function StrategyDesign({ live }: { live?: LiveStrategyDesign }) {
  const [step, setStep] = useState(0);
  const [tab, setTab] = useState<"discover" | "positions">("discover");
  const [config, setConfig] = useState<Config>(initial);
  const [acknowledged, setAcknowledged] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);
  const [confirmStop, setConfirmStop] = useState(false);
  const [notice, setNotice] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const recipe = getRecipe(config.recipe);
  const amount = Number(config.amount);
  const inventoryValid = Number.isFinite(amount) && amount > 0 && amount <= 4.8;
  const allocationError = config.custom
    ? customValidation(config.custom)
    : null;
  const valid =
    config.name.trim().length > 0 && inventoryValid && !allocationError;
  const update = <K extends keyof Config>(key: K, value: Config[K]) => {
    setConfig((c) => ({ ...c, [key]: value }));
    setAcknowledged(false);
  };
  useEffect(() => {
    if (step > 0) heading.current?.focus();
  }, [step]);
  const navigate = (next: number) => {
    setStep(next);
    setNotice("");
  };
  const choose = (id: RecipeId) => {
    setConfig((c) => ({
      ...c,
      custom: undefined,
      recipe: id,
      width: id === "wide" ? 40 : 15,
    }));
    setAcknowledged(false);
    navigate(1);
  };
  const startCustom = () => {
    setConfig({
      ...initial,
      name: "My custom ETH strategy",
      custom: newCustomSettings(),
    });
    setAcknowledged(false);
    setTab("discover");
    navigate(1);
  };
  const showPositions = () => {
    setTab("positions");
    navigate(3);
  };
  const startNew = () => {
    setTab("discover");
    setConfig(initial);
    setAcknowledged(false);
    navigate(0);
  };
  const launch = () => {
    if (!valid || !acknowledged) return;
    setPosition({
      config: { ...config, name: config.name.trim() },
      status: "running",
      events: ["Strategy created in the demo. No transaction was sent."],
    });
    setConfirmStop(false);
    setTab("positions");
    navigate(3);
    setNotice("Demo strategy created. Your real wallet has not changed.");
  };
  const changeStatus = (status: Position["status"]) => {
    setPosition(
      (p) =>
        p && {
          ...p,
          status,
          events: [
            status === "running"
              ? "Browser reviews resumed in the demo."
              : status === "paused"
                ? "Browser reviews paused. Existing liquidity remains available."
                : "Management stopped. Liquidity was not withdrawn.",
            ...p.events,
          ],
        },
    );
    setConfirmStop(false);
    setNotice(
      status === "stopped"
        ? "Demo management stopped. This does not withdraw liquidity."
        : `Demo reviews ${status === "paused" ? "paused" : "resumed"}.`,
    );
  };

  return (
    <MainLayout activePage="strategies">
      <div className={s.shell}>

      {live ? (
        <div className={s.previewBar}>
          <ShieldCheck size={14} />
          Wallet-backed liquidity · Review each plan before approving
          transactions
        </div>
      ) : (
        <div className={s.previewBar}>
          <FlaskConical size={14} />
          <span>
            Design playground{" "}
            <span className={s.previewDetail}>
              · Sample balances. Simulated actions. No wallet connection.
            </span>
          </span>
          <button
            onClick={() => {
              setPosition(null);
              setConfirmStop(false);
              startNew();
            }}
          >
            Reset demo <RotateCcw size={12} />
          </button>
        </div>
      )}
      <main className={s.main}>
        <div className={s.headingRow}>
          <div>
            <div className={s.eyebrow}>AQUA STRATEGIES</div>
            <h1 ref={heading} tabIndex={-1}>
              {step === 0 ? (
                <>
                  Your liquidity.
                  <br className={s.mobileBreak} /> Your strategy.
                </>
              ) : step === 1 ? (
                "Make it your own."
              ) : step === 2 ? (
                "A clear plan. Your call."
              ) : (
                "Your strategy workspace."
              )}
            </h1>
            <p>
              {step === 0
                ? "Choose an approach, set your boundaries, and stay in control."
                : step === 1
                  ? "Define your inventory, allocation, and rules before you start."
                  : step === 2
                    ? live
                      ? "Review every detail before requesting a fresh strategy proposal."
                      : "Review every detail before creating your demo strategy."
                    : "Follow your inventory and decide when your strategy changes."}
            </p>
          </div>
          <div className={s.headingNote}>
            <ShieldCheck size={18} />
            <span>
              Wallet-backed liquidity<small>You approve every action</small>
            </span>
          </div>
        </div>
        <div className={s.sectionNav}>
          <div className={s.tabs}>
            <button
              className={tab === "discover" ? s.activeTab : ""}
              onClick={() => {
                setTab("discover");
                navigate(0);
              }}
            >
              Discover strategies
            </button>
            <button
              className={tab === "positions" ? s.activeTab : ""}
              onClick={showPositions}
            >
              My strategies <span>{live ? live.count : position ? 1 : 0}</span>
            </button>
          </div>
          <span className={s.browserNote}>
            <span />
            Browser-bound reviews
          </span>
        </div>
        {tab === "discover" && (
          <ol className={s.steps} aria-label="Create a strategy">
            {["Choose strategy", "Configure", "Review & create"].map(
              (label, i) => (
                <li
                  key={label}
                  className={
                    step === i ? s.currentStep : step > i ? s.completeStep : ""
                  }
                  aria-current={step === i ? "step" : undefined}
                >
                  <span>{step > i ? <Check size={13} /> : `0${i + 1}`}</span>
                  {label}
                  {i < 2 && <ChevronRight size={14} />}
                </li>
              ),
            )}
          </ol>
        )}
        {live?.status}
        {live && live.wallet}
        {live &&
          (step === 1 || step === 2) &&
          live.configure(config.recipe, !!config.custom, {
            back: () => navigate(0),
            review: () => navigate(2),
            edit: () => navigate(1),
            created: showPositions,
          })}
        {live && step === 3 && live.positions}
        {notice && (
          <div className={s.notice} role="status">
            <CheckCheck size={18} />
            {notice}
          </div>
        )}

        {step === 0 && (
          <>
            <section className={s.introPanel}>
              <div>
                <span className={s.eyebrow}>
                  ONE INVENTORY. MULTIPLE MARKETS.
                </span>
                <h2>
                  Put your ETH to work,
                  <br />
                  without splitting it apart.
                </h2>
                <p>
                  Share wallet-backed inventory across pairs. Choose how ranges
                  are managed, with clear limits on every proposed change.
                </p>
                <a href="#strategy-recipes">
                  Find your strategy <ArrowDown size={15} />
                </a>
              </div>
              <div
                className={s.flow}
                aria-label="One wallet inventory shared with WETH/USDC and WETH/ARB"
              >
                <div className={s.flowSource}>
                  <span className={s.coin}>Ξ</span>
                  <div>
                    <strong>Your WETH inventory</strong>
                    <small>Stays in your wallet</small>
                  </div>
                  <LockKeyhole size={15} />
                </div>
                <div className={s.flowBranch} />
                <div className={s.flowPairs}>
                  <div>
                    <Pair />
                    <small>Stablecoin market</small>
                  </div>
                  <div>
                    <Pair second="ARB" />
                    <small>Token market</small>
                  </div>
                </div>
                <span className={s.flowCaption}>
                  Shared backing, not duplicated capital
                </span>
              </div>
            </section>
            <div className={s.catalogHeading} id="strategy-recipes">
              <div>
                <h2>Start with an approach</h2>
                <p>
                  Three ways to manage your liquidity. The same control over
                  your wallet.
                </p>
              </div>
              <span>01 / CHOOSE</span>
            </div>
            <div className={s.recipeGrid}>
              {recipes.map((r) => (
                <article
                  key={r.id}
                  className={`${s.recipeCard} ${r.id === "managed" ? s.featured : ""}`}
                >
                  <div className={s.recipeTop}>
                    <span className={s.recipeIcon}>
                      <r.icon size={21} />
                    </span>
                    <span className={s.tag}>{r.tag}</span>
                  </div>
                  <h3>{r.name}</h3>
                  <p>{r.description}</p>
                  <RangeGraphic kind={r.id} />
                  <div className={s.diagramLabels}>
                    <span>{r.range} range</span>
                    <span>Illustration only</span>
                  </div>
                  <dl className={s.recipeFacts}>
                    <div>
                      <dt>Management</dt>
                      <dd>{r.management}</dd>
                    </div>
                    <div>
                      <dt>Execution</dt>
                      <dd>Manual confirmation</dd>
                    </div>
                  </dl>
                  <button
                    className={r.id === "managed" ? s.primary : s.secondary}
                    onClick={() => choose(r.id)}
                  >
                    Configure strategy <ArrowRight size={16} />
                  </button>
                  <span className={s.recipeFoot}>
                    {r.id === "wide"
                      ? "Broad ranges still carry market risk"
                      : "Experimental strategy"}
                  </span>
                </article>
              ))}
            </div>
            <CustomEntry onStart={startCustom} />
            <div className={s.bottomGrid}>
              <div className={s.comingSoon}>
                <Activity size={22} />
                <div>
                  <h3>
                    Inventory-aware market making <span>Coming later</span>
                  </h3>
                  <p>
                    Inventory-based buy and sell quotes. Not available in this
                    release.
                  </p>
                </div>
              </div>
              <div className={s.infoNote}>
                <CircleHelp size={19} />
                <p>
                  Ranges are illustrative, not return forecasts. All strategies
                  carry inventory and execution risk.
                </p>
              </div>
            </div>
            <details className={s.faq}>
              <summary>What happens when I close this tab?</summary>
              <p>
                Recurring reviews require an active browser session. Closing the
                tab stops reviews, but existing positions may still fill.
                Pausing management does not withdraw liquidity.{" "}
                {!live &&
                  "This playground simulates that flow without creating real positions."}
              </p>
            </details>
          </>
        )}

        {!live && step === 1 && (
          <div className={s.workspace}>
            <section className={s.panel}>
              <div className={s.panelTitle}>
                <span className={s.recipeIcon}>
                  <SlidersHorizontal size={20} />
                </span>
                <div>
                  <h2>
                    {config.custom
                      ? "Build your custom strategy"
                      : "Configure your strategy"}
                  </h2>
                  <p>{strategyName(config)} · Arbitrum · Demo wallet</p>
                </div>
                <button className={s.textButton} onClick={() => navigate(0)}>
                  Change
                </button>
              </div>
              <label className={s.field}>
                Strategy name
                <input
                  maxLength={40}
                  value={config.name}
                  onChange={(e) => update("name", e.target.value)}
                  placeholder="Name your strategy"
                />
              </label>
              <div className={s.fieldLabel}>
                <label htmlFor="strategy-amount">Shared base inventory</label>
                <span>Demo balance: 4.80 WETH</span>
              </div>
              <div
                className={`${s.amountBox} ${!inventoryValid ? s.invalid : ""}`}
              >
                <div>
                  <input
                    id="strategy-amount"
                    type="number"
                    min="0.0001"
                    max="4.8"
                    step="any"
                    value={config.amount}
                    onChange={(e) => update("amount", e.target.value)}
                    aria-describedby="amount-help"
                  />
                  <span className={s.asset}>
                    <span className={s.coin}>Ξ</span>WETH
                  </span>
                </div>
                <div>
                  <span>
                    {money(
                      Number.isFinite(amount) && amount > 0 ? amount * 3250 : 0,
                    )}{" "}
                    <small>· Sample price $3,250</small>
                  </span>
                  <button onClick={() => update("amount", "4.8")}>
                    Use max
                  </button>
                </div>
              </div>
              <p
                id="amount-help"
                className={
                  inventoryValid && config.name.trim() ? s.fieldHelp : s.error
                }
              >
                {!config.name.trim()
                  ? "Enter a strategy name."
                  : !inventoryValid
                    ? "Enter an amount greater than 0 and no more than 4.8 WETH."
                    : "This inventory backs your selected markets. It is not spent twice."}
              </p>
              {config.custom ? (
                <CustomMarkets
                  value={config.custom}
                  onChange={(value) => update("custom", value)}
                />
              ) : (
                <>
                  <div className={s.subheading}>
                    <h3>Pair allocation</h3>
                    <span>100% allocated</span>
                  </div>
                  <div className={s.allocationRows}>
                    <div>
                      <Pair />
                      <strong>{config.weight}%</strong>
                    </div>
                    <div>
                      <Pair second="ARB" />
                      <strong>{100 - config.weight}%</strong>
                    </div>
                  </div>
                  <label className={s.sliderLabel} htmlFor="pair-weight">
                    WETH / USDC weight <span>{config.weight}%</span>
                  </label>
                  <input
                    className={s.slider}
                    id="pair-weight"
                    type="range"
                    min="10"
                    max="90"
                    step="5"
                    value={config.weight}
                    onChange={(e) => update("weight", Number(e.target.value))}
                  />
                  <p className={s.fieldHelp}>
                    Illustrative virtual allocation. Real inventory is shared
                    across pairs.
                  </p>
                </>
              )}
              {config.custom && (
                <section
                  className={c.section}
                  aria-labelledby="custom-behavior-title"
                >
                  <div className={c.title}>
                    <span>02</span>
                    <div>
                      <h3 id="custom-behavior-title">
                        Set your range behavior
                      </h3>
                      <p>Choose how a review should respond to a price move.</p>
                    </div>
                  </div>
                  <label className={s.field}>
                    Range behavior
                    <select
                      value={config.recipe}
                      onChange={(e) => {
                        const id = e.target.value as RecipeId;
                        setConfig((current) => ({
                          ...current,
                          recipe: id,
                          width: id === "wide" ? 40 : 15,
                        }));
                        setAcknowledged(false);
                      }}
                    >
                      {recipes.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.management}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className={s.fieldHelp}>
                    {config.recipe === "wide"
                      ? "Monitor the current range without proposing recentering. Triggered reviews can still report inventory changes."
                      : config.recipe === "upward"
                        ? "Propose a replacement only when the reference price moves upward. Hold or pause on a decline."
                        : "Propose a new range when a review signal fires, subject to your limits and manual approval."}
                  </p>
                </section>
              )}
              <div className={s.subheading}>
                <h3>Range width</h3>
                <span>±{config.width}% of reference price</span>
              </div>
              {config.custom ? (
                <>
                  <label className={s.sliderLabel} htmlFor="custom-range-width">
                    Width around each pair&apos;s reference price
                    <span>±{config.width}%</span>
                  </label>
                  <input
                    id="custom-range-width"
                    className={s.slider}
                    type="range"
                    min="5"
                    max="50"
                    step="1"
                    value={config.width}
                    onChange={(e) => update("width", Number(e.target.value))}
                  />
                  <p className={s.fieldHelp}>
                    The same percentage width applies to each selected market.
                  </p>
                </>
              ) : (
                <div className={s.segmented}>
                  {(config.recipe === "wide" ? [30, 40, 50] : [5, 15, 25]).map(
                    (width) => (
                      <button
                        key={width}
                        aria-pressed={config.width === width}
                        className={config.width === width ? s.selected : ""}
                        onClick={() => update("width", width)}
                      >
                        ±{width}%
                        <small>
                          {width <= 5
                            ? "Narrow"
                            : width <= 15
                              ? "Balanced"
                              : "Wide"}
                        </small>
                      </button>
                    ),
                  )}
                </div>
              )}
              {config.custom && (
                <CustomTriggers
                  value={config.custom}
                  onChange={(value) => update("custom", value)}
                />
              )}
              <div className={s.subheading}>
                <h3>
                  {config.custom
                    ? "04 / Set your management limits"
                    : "Management limits"}
                </h3>
                <ShieldCheck size={16} />
              </div>
              <div className={s.fieldGrid}>
                <label className={s.field}>
                  Review interval
                  <select
                    value={config.interval}
                    onChange={(e) => update("interval", e.target.value)}
                  >
                    <option value="5">Every 5 minutes</option>
                    <option value="15">Every 15 minutes</option>
                    <option value="30">Every 30 minutes</option>
                  </select>
                </label>
                <label className={s.field}>
                  Maximum slippage
                  <select
                    value={config.slippage}
                    onChange={(e) => update("slippage", e.target.value)}
                  >
                    <option value="0.1">0.1%</option>
                    <option value="0.5">0.5%</option>
                    <option value="1">1.0%</option>
                  </select>
                </label>
                <label className={s.field}>
                  Action budget
                  <select
                    value={config.budget}
                    onChange={(e) => update("budget", e.target.value)}
                  >
                    <option value="5">5 actions</option>
                    <option value="10">10 actions</option>
                    <option value="20">20 actions</option>
                  </select>
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
                <button className={s.back} onClick={() => navigate(0)}>
                  <ArrowLeft size={15} />
                  Back
                </button>
                <button
                  className={s.primary}
                  disabled={!valid}
                  onClick={() => navigate(2)}
                >
                  Review strategy <ArrowRight size={16} />
                </button>
              </div>
              {allocationError && (
                <p className={s.error}>
                  Finish your market allocations before reviewing.
                </p>
              )}
            </section>
            <aside className={s.sidebar}>
              <section className={s.previewPanel}>
                <span className={s.eyebrow}>YOUR STRATEGY AT A GLANCE</span>
                <h2>{strategyName(config)}</h2>
                <RangeGraphic kind={config.recipe} width={config.width} />
                <div className={s.priceLabels}>
                  <span>
                    {money(3250 * (1 - config.width / 100))}
                    <small>Lower reference</small>
                  </span>
                  <span>
                    {money(3250 * (1 + config.width / 100))}
                    <small>Upper reference</small>
                  </span>
                </div>
                <p className={s.fieldHelp}>
                  Illustrative WETH price in USD at a sample price of $3,250.
                  Other quote-token prices are not modeled.
                </p>
                <dl className={s.facts}>
                  <div>
                    <dt>Base inventory</dt>
                    <dd>
                      {Number.isFinite(amount) && amount > 0 ? amount : 0} WETH
                    </dd>
                  </div>
                  <div>
                    <dt>Markets</dt>
                    <dd>
                      {marketsFor(config).length}{" "}
                      {marketsFor(config).length === 1 ? "pair" : "pairs"}
                    </dd>
                  </div>
                  <div>
                    <dt>Management</dt>
                    <dd>{recipe.management}</dd>
                  </div>
                  <div>
                    <dt>Approval</dt>
                    <dd>Every transaction</dd>
                  </div>
                </dl>
                {config.custom && (
                  <CustomSummary
                    value={config.custom}
                    behavior={recipe.management}
                  />
                )}
              </section>
              <section className={s.safetyCard}>
                <ShieldCheck size={22} />
                <h3>Defined limits, no surprises.</h3>
                <p>
                  Proposed actions must stay within your limits. Nothing in this
                  demo asks for a signature or moves funds.
                </p>
              </section>
              <div className={s.riskNote}>
                <CircleHelp size={17} />
                <p>{recipe.risk}</p>
              </div>
            </aside>
          </div>
        )}

        {!live && step === 2 && (
          <div className={s.workspace}>
            <section className={s.panel}>
              <div className={s.panelTitle}>
                <span className={s.recipeIcon}>
                  <CheckCheck size={21} />
                </span>
                <div>
                  <h2>Review your plan</h2>
                  <p>One final check before the simulated launch.</p>
                </div>
                <button className={s.textButton} onClick={() => navigate(1)}>
                  Edit
                </button>
              </div>
              <div className={s.reviewHero}>
                <span className={s.tag}>{strategyName(config)}</span>
                <h2>{config.name}</h2>
                <strong>
                  {config.amount} <span>WETH</span>
                </strong>
                <p>{money(amount * 3250)} in sample shared inventory</p>
              </div>
              <AllocationSummary config={config} />
              {config.custom && (
                <CustomSummary
                  value={config.custom}
                  behavior={recipe.management}
                />
              )}
              <dl className={s.facts}>
                <div>
                  <dt>Reference range width</dt>
                  <dd>±{config.width}%</dd>
                </div>
                <div>
                  <dt>Review interval</dt>
                  <dd>Every {config.interval} minutes</dd>
                </div>
                <div>
                  <dt>Maximum slippage</dt>
                  <dd>{config.slippage}%</dd>
                </div>
                <div>
                  <dt>Action budget</dt>
                  <dd>{config.budget} actions</dd>
                </div>
                <div>
                  <dt>Execution mode</dt>
                  <dd>Manual confirmation</dd>
                </div>
                <div>
                  <dt>Network</dt>
                  <dd>Arbitrum · Demo only</dd>
                </div>
              </dl>
              <div className={s.warning}>
                <ShieldCheck size={18} />
                <div>
                  <strong>Know what you are approving</strong>
                  <p>
                    {recipe.risk} Shared reserves compete across pairs. Pausing
                    reviews does not withdraw liquidity.
                  </p>
                </div>
              </div>
              <label className={s.checkbox}>
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                />
                <span>
                  I understand the risks and that this creates a simulated
                  strategy only.
                </span>
              </label>
              <div className={s.actions}>
                <button className={s.back} onClick={() => navigate(1)}>
                  <ArrowLeft size={15} />
                  Back
                </button>
                <button
                  className={s.primary}
                  disabled={!acknowledged || !valid}
                  onClick={launch}
                >
                  Create demo strategy <ArrowRight size={16} />
                </button>
              </div>
            </section>
            <aside className={s.sidebar}>
              <section className={s.previewPanel}>
                <span className={s.eyebrow}>WHAT HAPPENS NEXT</span>
                <h2>From plan to position.</h2>
                <ol className={s.timeline}>
                  {[
                    [
                      "Confirm the plan",
                      "Your pair allocations and limits are saved in this page only.",
                    ],
                    [
                      "Preview the launch",
                      "The demo skips token approvals and onchain registration.",
                    ],
                    [
                      "Manage your strategy",
                      "Try a review, pause management, or stop it. No funds move.",
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
              <div className={s.riskNote}>
                <FlaskConical size={18} />
                <p>
                  {position
                    ? "Creating a new demo replaces the previous sample position. "
                    : ""}
                  Reloading the page resets this playground.
                </p>
              </div>
            </aside>
          </div>
        )}

        {!live && step === 3 && !position && (
          <section className={s.empty}>
            <span className={s.recipeIcon}>
              <Layers3 size={28} />
            </span>
            <h2>Your first strategy starts here.</h2>
            <p>
              Choose an approach and try the complete flow with a demo wallet.
            </p>
            <button className={s.primary} onClick={startNew}>
              Explore strategies <ArrowRight size={16} />
            </button>
            <small>No wallet connection or funds needed.</small>
          </section>
        )}
        {!live && step === 3 && position && (
          <>
            <div className={s.positionHeading}>
              <div>
                <span className={s.eyebrow}>
                  {strategyName(position.config)} · ARBITRUM
                </span>
                <h2>{position.config.name}</h2>
              </div>
              <button className={s.secondary} onClick={startNew}>
                <Plus size={16} />
                New strategy
              </button>
            </div>
            <div className={s.statGrid}>
              <div>
                <span>Shared base inventory</span>
                <strong>
                  {position.config.amount} <small>WETH</small>
                </strong>
                <p>
                  {money(Number(position.config.amount) * 3250)} · Sample
                  valuation
                </p>
              </div>
              <div>
                <span>Liquidity markets</span>
                <strong>
                  {marketsFor(position.config).length}{" "}
                  <small>
                    {marketsFor(position.config).length === 1
                      ? "pair"
                      : "pairs"}
                  </small>
                </strong>
                <p>
                  {marketsFor(position.config)
                    .map((market) => `WETH / ${market.symbol}`)
                    .join(" · ")}
                </p>
              </div>
              <div>
                <span>Management status</span>
                <strong
                  className={
                    position.status === "running" ? s.green : s.neutral
                  }
                >
                  {position.status === "running"
                    ? "Running"
                    : position.status === "paused"
                      ? "Paused"
                      : "Stopped"}
                </strong>
                <p>
                  {position.status === "running"
                    ? `Reviews every ${position.config.interval} minutes in demo`
                    : "No new reviews will run"}
                </p>
              </div>
            </div>
            <div className={s.workspace}>
              <section className={s.panel}>
                <div className={s.panelTitle}>
                  <span className={s.recipeIcon}>
                    <Activity size={20} />
                  </span>
                  <div>
                    <h2>Strategy activity</h2>
                    <p>Simulated decisions, with a reason for each.</p>
                  </div>
                </div>
                <div className={s.decision}>
                  <span className={s.tag}>HOLD POSITION</span>
                  <h3>No range change needed.</h3>
                  <p>
                    In this sample scenario, all selected markets remain inside
                    their configured ranges and inventory is on target. Keep the
                    current allocation. No transaction is proposed.
                  </p>
                  <span>
                    <Check size={14} />0 of {position.config.budget} actions
                    used
                  </span>
                </div>
                <div className={s.subheading}>
                  <h3>Activity log</h3>
                  <span>Sample session</span>
                </div>
                <ol className={s.eventList}>
                  {position.events.map((event, i) => (
                    <li key={`${event}-${i}`}>
                      <span>
                        <Check size={13} />
                      </span>
                      <div>
                        <strong>{event}</strong>
                        <small>
                          {i === 0
                            ? "Latest event"
                            : "Earlier this demo session"}
                        </small>
                      </div>
                    </li>
                  ))}
                </ol>
                <button
                  className={s.secondary}
                  disabled={position.status !== "running"}
                  onClick={() => {
                    setPosition(
                      (p) =>
                        p && {
                          ...p,
                          events: [
                            `Review complete. All ${marketsFor(p.config).length} markets in range; inventory on target. Decision: hold.`,
                            ...p.events,
                          ],
                        },
                    );
                    setNotice("Simulated review complete. No action needed.");
                  }}
                >
                  <RotateCcw size={15} />
                  Simulate a review
                </button>
              </section>
              <aside className={s.sidebar}>
                <section className={s.previewPanel}>
                  <span className={s.eyebrow}>MANAGEMENT CONTROLS</span>
                  <h2>You make the call.</h2>
                  <dl className={s.facts}>
                    <div>
                      <dt>Slippage limit</dt>
                      <dd>{position.config.slippage}%</dd>
                    </div>
                    <div>
                      <dt>Range width</dt>
                      <dd>±{position.config.width}%</dd>
                    </div>
                    <div>
                      <dt>Approval</dt>
                      <dd>Every transaction</dd>
                    </div>
                  </dl>
                  {position.config.custom && (
                    <>
                      <CustomSummary
                        value={position.config.custom}
                        behavior={getRecipe(position.config.recipe).management}
                      />
                      <div className={s.subheading}>
                        <h3>Saved allocations</h3>
                      </div>
                      <AllocationSummary config={position.config} />
                    </>
                  )}
                  <button
                    className={s.secondary}
                    disabled={position.status === "stopped"}
                    onClick={() =>
                      changeStatus(
                        position.status === "running" ? "paused" : "running",
                      )
                    }
                  >
                    {position.status === "running" ? (
                      <Pause size={15} />
                    ) : (
                      <Play size={15} />
                    )}
                    {position.status === "running"
                      ? "Pause reviews"
                      : "Resume reviews"}
                  </button>
                  {position.status !== "stopped" && !confirmStop && (
                    <button
                      className={s.dangerButton}
                      onClick={() => setConfirmStop(true)}
                    >
                      Stop management
                    </button>
                  )}
                  {confirmStop && (
                    <div className={s.stopConfirm}>
                      <strong>Stop this demo strategy?</strong>
                      <p>
                        Reviews stop. Existing liquidity is not withdrawn. You
                        can create a new demo to start again.
                      </p>
                      <div>
                        <button
                          className={s.secondary}
                          onClick={() => setConfirmStop(false)}
                        >
                          Cancel
                        </button>
                        <button
                          className={s.dangerButton}
                          onClick={() => changeStatus("stopped")}
                        >
                          Confirm stop
                        </button>
                      </div>
                    </div>
                  )}
                </section>
                <div className={s.riskNote}>
                  <Clock3 size={18} />
                  <p>
                    Real reviews require an active browser session. Existing
                    positions may still fill after management stops.
                  </p>
                </div>
              </aside>
            </div>
          </>
        )}

      </main>
      </div>
    </MainLayout>
  );
}
