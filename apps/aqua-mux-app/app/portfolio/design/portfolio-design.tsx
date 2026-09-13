"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRight,
  Check,
  ChevronDown,
  CircleHelp,
  Download,
  ExternalLink,
  Layers,
  Search,
  ShieldCheck,
  Wallet,
  Waves,
  X,
} from "lucide-react";
import { MainLayout } from "@/components/layouts/MainLayout";
import s from "./portfolio.module.css";

const assets = [
  {
    symbol: "ETH",
    name: "Ethereum",
    color: "#717ce9",
    glyph: "Ξ",
    balance: "8.4200",
    price: 3240.18,
    value: 27282.32,
    change: 3.24,
    allocation: 42.5,
    network: "Ethereum",
    history: [9, 12, 10, 15, 14, 20, 18, 24, 22, 30],
  },
  {
    symbol: "USDC",
    name: "USD Coin",
    color: "#367cda",
    glyph: "$",
    balance: "18,450.00",
    price: 1,
    value: 18450,
    change: 0.01,
    allocation: 28.7,
    network: "Base",
    history: [18, 18, 19, 18, 18, 19, 18, 18, 19, 18],
  },
  {
    symbol: "WBTC",
    name: "Wrapped Bitcoin",
    color: "#ec9d41",
    glyph: "₿",
    balance: "0.1520",
    price: 67480,
    value: 10256.96,
    change: 1.82,
    allocation: 16,
    network: "Ethereum",
    history: [8, 12, 10, 14, 17, 16, 20, 19, 26, 29],
  },
  {
    symbol: "AERO",
    name: "Aerodrome",
    color: "#4177fa",
    glyph: "A",
    balance: "6,854.84",
    price: 1.2,
    value: 8225.81,
    change: -2.16,
    allocation: 12.8,
    network: "Base",
    history: [28, 25, 27, 22, 23, 20, 17, 19, 13, 11],
  },
];
const money = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
const periods = {
  "24H": {
    gain: "1,482.36",
    percent: "2.36",
    labels: ["00:00", "04:00", "08:00", "12:00", "16:00", "20:00"],
    values: [
      37, 40, 35, 43, 41, 51, 45, 56, 58, 52, 65, 69, 64, 73, 70, 83, 78, 86,
      83, 94,
    ],
  },
  "1W": {
    gain: "3,914.72",
    percent: "6.49",
    labels: ["Jun 12", "Jun 13", "Jun 14", "Jun 15", "Jun 16", "Jun 18"],
    values: [
      25, 32, 30, 40, 35, 38, 48, 44, 52, 49, 55, 65, 60, 74, 69, 77, 72, 82,
      87, 94,
    ],
  },
  "1M": {
    gain: "8,246.18",
    percent: "14.73",
    labels: ["May 18", "May 24", "May 30", "Jun 5", "Jun 11", "Jun 18"],
    values: [
      20, 26, 23, 37, 33, 42, 36, 31, 48, 54, 48, 65, 61, 72, 66, 80, 75, 88,
      84, 94,
    ],
  },
  "1Y": {
    gain: "21,387.90",
    percent: "49.94",
    labels: ["Jul", "Sep", "Nov", "Jan", "Mar", "Jun"],
    values: [
      8, 18, 12, 24, 20, 32, 26, 40, 35, 52, 43, 58, 54, 67, 61, 78, 72, 81, 86,
      94,
    ],
  },
};
type Period = keyof typeof periods;
function Token({ asset }: { asset: (typeof assets)[number] }) {
  return (
    <span className={s.token} style={{ background: asset.color }}>
      {asset.glyph}
    </span>
  );
}

export function PortfolioDesign() {
  const [period, setPeriod] = useState<Period>("1M");
  const [tab, setTab] = useState("Assets");
  const [query, setQuery] = useState("");
  const [network, setNetwork] = useState("All networks");
  const [selected, setSelected] = useState<(typeof assets)[number] | null>(
    null,
  );
  const [hover, setHover] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const data = periods[period];
  const points = data.values
    .map((v, i) => `${(i * 800) / 19},${190 - v * 1.7}`)
    .join(" ");
  const filtered = assets.filter(
    (a) =>
      `${a.name} ${a.symbol}`.toLowerCase().includes(query.toLowerCase()) &&
      (network === "All networks" || a.network === network),
  );
  function download() {
    const csv =
      "Asset,Network,Balance,Price USD,Value USD\n" +
      assets
        .map(
          (a) =>
            `${a.symbol},${a.network},${a.balance.replaceAll(",", "")},${a.price},${a.value}`,
        )
        .join("\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8;" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "aquamux-demo-portfolio.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <MainLayout activePage="portfolio">
      <div className={s.root}>

      <main className={s.main}>
        <div className={s.heading}>
          <div>
            <div className={s.eyebrow}>YOUR ONCHAIN OVERVIEW</div>
            <h1>Portfolio</h1>
            <p>Every asset. Every position. One place.</p>
          </div>
          <button className={s.secondary} onClick={download}>
            <Download size={15} /> Export portfolio
          </button>
        </div>
        <div className={s.overview}>
          <section
            className={`${s.card} ${s.performance}`}
            aria-label="Portfolio performance"
          >
            <div className={s.cardTop}>
              <span className={s.label}>
                Total portfolio value{" "}
                <span title="Wallet assets, including assets allocated to liquidity positions">
                  <CircleHelp size={13} />
                </span>
              </span>
              <span className={s.live}>
                <span />
                Sample snapshot
              </span>
            </div>
            <div className={s.value}>
              $64,215<span>.09</span>
            </div>
            <div className={s.performanceBar}>
              <div className={s.gain}>
                <ArrowUpRight size={15} /> ${data.gain}{" "}
                <span>+{data.percent}%</span>
                <small>
                  past{" "}
                  {period === "24H"
                    ? "24 hours"
                    : period === "1W"
                      ? "week"
                      : period === "1M"
                        ? "month"
                        : "year"}
                </small>
              </div>
              <div className={s.periods} aria-label="Chart time range">
                {(Object.keys(periods) as Period[]).map((p) => (
                  <button
                    key={p}
                    aria-pressed={p === period}
                    className={p === period ? s.chosen : ""}
                    onClick={() => {
                      setPeriod(p);
                      setHover(null);
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div className={s.chart} onMouseLeave={() => setHover(null)}>
              <div className={s.gridLines}>
                <span>$65k</span>
                <span>$60k</span>
                <span>$55k</span>
              </div>
              <svg
                viewBox="0 0 800 205"
                preserveAspectRatio="none"
                role="img"
                aria-label={`Portfolio value increased ${data.percent}% over ${period}`}
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setHover(
                    Math.max(
                      0,
                      Math.min(
                        19,
                        Math.round(((e.clientX - rect.left) / rect.width) * 19),
                      ),
                    ),
                  );
                }}
              >
                <defs>
                  <linearGradient
                    id="portfolioFill"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor="#4975ee" stopOpacity=".18" />
                    <stop offset="100%" stopColor="#4975ee" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <polygon
                  points={`0,205 ${points} 800,205`}
                  fill="url(#portfolioFill)"
                />
                <polyline
                  points={points}
                  fill="none"
                  stroke="#4b72eb"
                  strokeWidth="2.8"
                  vectorEffect="non-scaling-stroke"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {hover !== null && (
                  <g>
                    <line
                      x1={(hover * 800) / 19}
                      x2={(hover * 800) / 19}
                      y1="0"
                      y2="205"
                      stroke="#97a9d7"
                      strokeDasharray="4 4"
                    />
                    <circle
                      cx={(hover * 800) / 19}
                      cy={190 - data.values[hover] * 1.7}
                      r="5"
                      fill="#4b72eb"
                      stroke="white"
                      strokeWidth="3"
                    />
                  </g>
                )}
              </svg>
              {hover !== null && (
                <div
                  className={s.tooltip}
                  style={{
                    left: `${Math.min(80, Math.max(8, (hover / 19) * 90))}%`,
                  }}
                >
                  {money(
                    64215.09 -
                      ((94 - data.values[hover]) / (94 - data.values[0])) *
                        Number(data.gain.replaceAll(",", "")),
                  )}
                </div>
              )}
            </div>
            <div className={s.axis}>
              {data.labels.map((l) => (
                <span key={l}>{l}</span>
              ))}
            </div>
            <div className={s.chartFooter}>
              <span>
                <span className={s.blueDot} /> Portfolio value
              </span>
              <span>
                USD <ChevronDown size={12} />
              </span>
            </div>
          </section>
          <section className={`${s.card} ${s.allocation}`}>
            <div className={s.cardTop}>
              <h2>Asset allocation</h2>
              <span className={s.count}>4 assets</span>
            </div>
            <div className={s.donut}>
              <div>
                <span>Diversified across</span>
                <strong>2 networks</strong>
                <span className={s.networkDots}>
                  <i /> Ethereum <i /> Base
                </span>
              </div>
            </div>
            <div className={s.legend}>
              {assets.map((a) => (
                <button
                  key={a.symbol}
                  onClick={() => {
                    setCopied(false);
                    setSelected(a);
                  }}
                >
                  <span>
                    <i style={{ background: a.color }} />
                    {a.symbol}
                  </span>
                  <span>
                    {a.allocation.toFixed(1)}%<ArrowUpRight size={12} />
                  </span>
                </button>
              ))}
            </div>
          </section>
        </div>
        <div className={s.stats}>
          <div>
            <span className={s.statIcon}>
              <Wallet size={18} />
            </span>
            <div>
              <span>Available balance</span>
              <strong>$45,815.09</strong>
            </div>
            <span className={s.statNote}>Ready to deploy</span>
          </div>
          <div>
            <span className={`${s.statIcon} ${s.purple}`}>
              <Layers size={18} />
            </span>
            <div>
              <span>In liquidity</span>
              <strong>$18,400.00</strong>
            </div>
            <span className={s.statNote}>2 positions</span>
          </div>
          <div>
            <span className={`${s.statIcon} ${s.green}`}>
              <ArrowUpRight size={18} />
            </span>
            <div>
              <span>Fees earned · 30D</span>
              <strong>$284.62</strong>
            </div>
            <span className={s.positive}>+18.6%</span>
          </div>
        </div>
        <section className={`${s.card} ${s.holdings}`}>
          <div className={s.holdingsHeader}>
            <div
              className={s.tabs}
              role="tablist"
              aria-label="Portfolio holdings"
            >
              {["Assets", "Liquidity positions", "Activity"].map((t) => (
                <button
                  key={t}
                  role="tab"
                  id={`tab-${t.split(" ")[0]}`}
                  aria-controls="holdings-panel"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={tab === t ? s.activeTab : ""}
                >
                  {t}
                  <span>{t === "Assets" ? 4 : t === "Activity" ? 3 : 2}</span>
                </button>
              ))}
            </div>
            <div className={s.filters}>
              {tab === "Assets" && (
                <>
                  <label className={s.search}>
                    <Search size={14} />
                    <input
                      aria-label="Search assets"
                      placeholder="Search assets"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                  <select
                    aria-label="Filter network"
                    value={network}
                    onChange={(e) => setNetwork(e.target.value)}
                  >
                    {["All networks", "Ethereum", "Base"].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </>
              )}
            </div>
          </div>
          <div
            id="holdings-panel"
            role="tabpanel"
            aria-labelledby={`tab-${tab.split(" ")[0]}`}
            className={s.tableWrap}
          >
            {tab === "Assets" ? (
              <table>
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th>Price</th>
                    <th>24h change</th>
                    <th>7D trend</th>
                    <th>Balance</th>
                    <th>Value</th>
                    <th>
                      <span className={s.srOnly}>Details</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((a) => (
                    <tr key={a.symbol}>
                      <td>
                        <div className={s.asset}>
                          <Token asset={a} />
                          <div>
                            <strong>
                              {a.name}
                              <span>{a.symbol}</span>
                            </strong>
                            <small>
                              <i
                                className={
                                  a.network === "Base" ? s.baseDot : s.ethDot
                                }
                              />
                              {a.network}
                            </small>
                          </div>
                        </div>
                      </td>
                      <td>{money(a.price)}</td>
                      <td className={a.change > 0 ? s.positive : s.negative}>
                        {a.change > 0 ? "+" : ""}
                        {a.change.toFixed(2)}%
                      </td>
                      <td>
                        <svg
                          className={s.spark}
                          viewBox="0 0 92 36"
                          aria-label={`${a.symbol} seven-day trend`}
                          role="img"
                        >
                          <polyline
                            points={a.history
                              .map((v, i) => `${i * 10},${36 - v}`)
                              .join(" ")}
                            stroke={a.change > 0 ? "#35a180" : "#d37b85"}
                            strokeWidth="1.7"
                            fill="none"
                          />
                        </svg>
                      </td>
                      <td>
                        {a.balance}
                        <small className={s.balanceSymbol}>{a.symbol}</small>
                      </td>
                      <td className={s.assetValue}>{money(a.value)}</td>
                      <td>
                        <button
                          className={s.iconButton}
                          aria-label={`View ${a.name} details`}
                          onClick={() => {
                            setCopied(false);
                            setSelected(a);
                          }}
                        >
                          <ArrowUpRight size={17} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : tab === "Liquidity positions" ? (
              <table>
                <thead>
                  <tr>
                    <th>Position</th>
                    <th>Network</th>
                    <th>Position value</th>
                    <th>Est. APR</th>
                    <th>30D fees</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    {
                      name: "ETH / USDC",
                      network: "Ethereum",
                      value: "$12,000.00",
                      apr: "8.42%",
                      fees: "$196.34",
                    },
                    {
                      name: "AERO / USDC",
                      network: "Base",
                      value: "$6,400.00",
                      apr: "14.16%",
                      fees: "$88.28",
                    },
                  ].map((p) => (
                    <tr key={p.name}>
                      <td>
                        <strong>{p.name}</strong>
                        <small className={s.balanceSymbol}>
                          Aqua shared liquidity
                        </small>
                      </td>
                      <td>{p.network}</td>
                      <td className={s.assetValue}>{p.value}</td>
                      <td className={s.positive}>{p.apr}</td>
                      <td>{p.fees}</td>
                      <td>
                        <span className={s.status}>In range</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Transaction</th>
                    <th>Assets</th>
                    <th>Value</th>
                    <th>Date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    {
                      type: "Swap",
                      assets: "USDC → ETH",
                      amount: "$2,500.00",
                      date: "Jun 18, 2025 · 10:42",
                    },
                    {
                      type: "Add liquidity",
                      assets: "ETH / USDC",
                      amount: "$12,000.00",
                      date: "Jun 16, 2025 · 14:08",
                    },
                    {
                      type: "Receive",
                      assets: "USDC",
                      amount: "$5,000.00",
                      date: "Jun 14, 2025 · 09:21",
                    },
                  ].map((a) => (
                    <tr key={a.type}>
                      <td>
                        <div className={s.activityType}>
                          <ArrowDownLeft size={17} />
                          <strong>{a.type}</strong>
                        </div>
                      </td>
                      <td>{a.assets}</td>
                      <td className={s.assetValue}>{a.amount}</td>
                      <td>{a.date}</td>
                      <td>
                        <span className={s.status}>
                          <Check size={12} /> Completed
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {tab === "Assets" && filtered.length === 0 && (
              <div className={s.empty}>
                No assets match your filters.
                <button
                  onClick={() => {
                    setQuery("");
                    setNetwork("All networks");
                  }}
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>
          <div className={s.tableFooter}>
            <span>
              <ShieldCheck size={14} /> Your assets stay in your wallet. Always.
            </span>
            <span>
              {tab === "Assets"
                ? `${filtered.length} assets`
                : tab === "Activity"
                  ? "3 transactions"
                  : "2 active positions"}
            </span>
          </div>
        </section>
        <section className={s.cta}>
          <div className={s.ctaIcon}>
            <Waves size={27} />
          </div>
          <div>
            <h2>Put your portfolio to work.</h2>
            <p>
              Provide liquidity across multiple strategies, without splitting
              your capital.
            </p>
          </div>
          <Link href="/lp/design">
            Explore liquidity <ArrowRight size={16} />
          </Link>
        </section>

      </main>
      {selected && (
        <div className={s.modalBackdrop} onClick={() => setSelected(null)}>
          <dialog
            open
            className={s.modal}
            aria-labelledby="asset-title"
            ref={(node) => node?.focus()}
            tabIndex={-1}
            onKeyDown={(e) => {
              if (e.key === "Escape") setSelected(null);
              if (e.key === "Tab") {
                const buttons = e.currentTarget.querySelectorAll("button");
                const first = buttons[0];
                const last = buttons[buttons.length - 1];
                if (
                  e.shiftKey &&
                  (document.activeElement === first ||
                    document.activeElement === e.currentTarget)
                ) {
                  e.preventDefault();
                  last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                  e.preventDefault();
                  first.focus();
                }
              }
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className={`${s.iconButton} ${s.close}`}
              onClick={() => setSelected(null)}
              aria-label="Close asset details"
            >
              <X size={20} />
            </button>
            <Token asset={selected} />
            <h2 id="asset-title">{selected.name}</h2>
            <p>
              {selected.symbol} on {selected.network}
            </p>
            <strong className={s.modalValue}>{money(selected.value)}</strong>
            <dl>
              <div>
                <dt>Balance</dt>
                <dd>
                  {selected.balance} {selected.symbol}
                </dd>
              </div>
              <div>
                <dt>Price</dt>
                <dd>{money(selected.price)}</dd>
              </div>
              <div>
                <dt>Portfolio allocation</dt>
                <dd>{selected.allocation}%</dd>
              </div>
            </dl>
            <button
              className={s.primary}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    `${selected.balance} ${selected.symbol} · ${money(selected.value)}`,
                  );
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? <Check size={16} /> : <ExternalLink size={16} />}
              {copied ? "Copied balance" : "Copy balance"}
            </button>
            <small>Sample asset details. No wallet is connected.</small>
          </dialog>
        </div>
      )}
      </div>
    </MainLayout>
  );
}
