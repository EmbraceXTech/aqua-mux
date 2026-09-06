import "./experience.css"
import { useEffect, useState } from "react"
import { useTheme } from "../components/theme-provider"
import { Brand, Chain, Icon, Modal, Sparkline, Token } from "./primitives"
import { AccessSetup, Evidence, Transaction } from "./flows"
import {
  markets,
  pools,
  starters,
  readStorage,
  saveStorage,
  money,
  type Access,
  type Market,
  type Position,
  type Thread,
} from "./data"

type Page =
  "Discover" | "Research" | "Portfolio" | "AI access" | "Shared access"
export function App() {
  const [page, setPage] = useState<Page>("Discover")
  const [mobileNav, setMobileNav] = useState(false)
  const [draft, setDraft] = useState("")
  const [tab, setTab] = useState("Stablecoin supply")
  const [chain, setChain] = useState("All chains")
  const [asset, setAsset] = useState("All assets")
  const [window, setWindow] = useState("7 days")
  const [sort, setSort] = useState(true)
  const [access, setAccess] = useState<Access | null>(() =>
    readStorage("access", null)
  )
  const [threads, setThreads] = useState<Thread[]>(() =>
    readStorage("threads", [])
  )
  const [positions, setPositions] = useState<Position[]>(() =>
    readStorage("positions", [])
  )
  const [activeThread, setActiveThread] = useState<Thread | null>(null)
  const [progress, setProgress] = useState(-1)
  const [modal, setModal] = useState<
    "access" | "wallet" | "evidence" | "help" | "clarify" | null
  >(null)
  const [sendAfterSetup, setSendAfterSetup] = useState(false)
  const [opportunity, setOpportunity] = useState<Market | null>(null)
  const [connected, setConnected] = useState(() => readStorage("wallet", false))
  const [walletRead, setWalletRead] = useState(false)
  const [context, setContext] = useState<string[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [toast, setToast] = useState("")
  const [refreshing, setRefreshing] = useState(false)
  const [refreshed, setRefreshed] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [availability, setAvailability] = useState("8 hours / day")
  const [researchError, setResearchError] = useState("")
  const [preview, setPreview] = useState("Normal")
  const { theme, setTheme } = useTheme()
  useEffect(() => saveStorage("access", access), [access])
  useEffect(() => saveStorage("threads", threads), [threads])
  useEffect(() => saveStorage("positions", positions), [positions])
  useEffect(() => saveStorage("wallet", connected), [connected])
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 3800)
      return () => clearTimeout(timer)
    }
  }, [toast])
  useEffect(() => {
    if (progress < 0 || progress >= 4) return
    const timer = setTimeout(() => setProgress(progress + 1), 850)
    return () => clearTimeout(timer)
  }, [progress])
  function navigate(next: Page) {
    setPage(next)
    setMobileNav(false)
    globalThis.scrollTo({ top: 0, behavior: "instant" })
  }
  function fill(question: string) {
    setDraft(question)
    setTimeout(
      () =>
        document
          .querySelector<HTMLTextAreaElement>("#research-question")
          ?.focus(),
      50
    )
  }
  function runResearch(chosenAccess = access, question = draft) {
    if (!chosenAccess || !question.trim()) return
    if (
      chosenAccess.type === "paid" &&
      chosenAccess.spent + 0.12 > chosenAccess.budget
    ) {
      setResearchError(
        "Your research budget has reached its cap. Increase your demo budget in AI access to continue."
      )
      return
    }
    if (preview === "Source unavailable") {
      setResearchError(
        "The sample source is unavailable. Reset the state preview to Normal and retry. Your question is preserved."
      )
      return
    }
    const thread: Thread = {
      id: crypto.randomUUID(),
      question: question.trim(),
      date: new Date().toISOString(),
      kind: /pool|uniswap|fees/i.test(question) ? "amm" : "lending",
      context: context.length,
      model: chosenAccess.model,
      cost: chosenAccess.type === "paid" ? 0.12 : 0,
    }
    setThreads((old) => [thread, ...old])
    setActiveThread(thread)
    setProgress(0)
    setDraft("")
    setContext([])
    setResearchError("")
    navigate("Research")
    if (chosenAccess.type === "paid")
      setAccess({
        ...chosenAccess,
        spent: Number((chosenAccess.spent + 0.12).toFixed(2)),
      })
  }
  function send() {
    if (!draft.trim() || (progress >= 0 && progress < 4)) return
    if (!/USDC|USDT|DAI|ETH|stablecoin|position|portfolio/i.test(draft)) {
      setModal("clarify")
      return
    }
    if (!access) {
      setSendAfterSetup(true)
      setModal("access")
      return
    }
    runResearch()
  }
  function openThread(thread: Thread) {
    setActiveThread(thread)
    setProgress(4)
    navigate("Research")
  }
  function refresh() {
    setRefreshing(true)
    setTimeout(() => {
      setRefreshing(false)
      setRefreshed(true)
      setToast("Sample snapshots refreshed. No live data was requested.")
    }, 900)
  }
  const filtered = markets
    .filter(
      (m) =>
        (chain === "All chains" || m.chain === chain) &&
        (asset === "All assets" || m.asset === asset)
    )
    .sort((a, b) => (sort ? b.apy - a.apy : a.apy - b.apy))
  const filteredPools = pools.filter(
    (p) =>
      (chain === "All chains" || p.chain === chain) &&
      (asset === "All assets" || p.pair.includes(asset))
  )
  const isBusy = progress >= 0 && progress < 4
  const contextPositions = positions.filter((p) => context.includes(p.id))
  const researchQuestion = activeThread?.question.toLowerCase() || ""
  const researchAssets = ["USDC", "USDT", "DAI"].filter((token) =>
    researchQuestion.includes(token.toLowerCase())
  )
  const researchChains = ["Base", "Arbitrum", "Ethereum"].filter((network) =>
    researchQuestion.includes(network.toLowerCase())
  )
  const researchMarkets = markets
    .filter(
      (m) =>
        (researchAssets.length
          ? researchAssets.includes(m.asset)
          : m.asset === "USDC") &&
        (!researchChains.length || researchChains.includes(m.chain))
    )
    .sort((a, b) => b.average - a.average)
  const topResearch = researchMarkets[0]
  const researchPools = pools.filter(
    (p) =>
      (!researchChains.length || researchChains.includes(p.chain)) &&
      (!researchAssets.length ||
        researchAssets.some((token) => p.pair.includes(token)))
  )
  const researchNetworks = new Set(
    (activeThread?.kind === "amm" ? researchPools : researchMarkets).map(
      (m) => m.chain
    )
  ).size
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileNav(false)
      if (
        event.key.toLowerCase() !== "n" ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        document.querySelector('[role="dialog"]') ||
        (event.target instanceof HTMLElement &&
          event.target.closest("input,textarea,select,[contenteditable]"))
      )
        return
      event.preventDefault()
      setActiveThread(null)
      setDraft("")
      setContext([])
      setProgress(-1)
      setPage("Research")
      setMobileNav(false)
      globalThis.scrollTo(0, 0)
      setTimeout(
        () =>
          document
            .querySelector<HTMLTextAreaElement>("#research-question")
            ?.focus(),
        50
      )
    }
    globalThis.addEventListener("keydown", shortcut)
    return () => globalThis.removeEventListener("keydown", shortcut)
  }, [])
  const composerUI = (
    <div
      className={`composer ${page === "Research" ? "research-composer" : ""}`}
    >
      {context.length > 0 && (
        <div className="context-chip">
          <Icon name="wallet" size={14} />
          {context.length} tracked position{context.length > 1 ? "s" : ""}{" "}
          included
          <button
            aria-label="Remove portfolio context"
            onClick={() => setContext([])}
          >
            <Icon name="close" size={13} />
          </button>
        </div>
      )}
      <textarea
        id="research-question"
        aria-label="Research question"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            send()
          }
        }}
        placeholder={
          page === "Research"
            ? "Ask a follow-up, or explore another angle..."
            : "Ask a question. Follow your curiosity."
        }
        rows={2}
      />
      <div className="composer-bottom">
        <div className="composer-tools">
          <button
            className="composer-model"
            onClick={() => {
              setSendAfterSetup(false)
              if (!access) setModal("access")
              else navigate("AI access")
            }}
          >
            <Icon name="spark" size={16} />
            {access?.model || "Choose your AI"}
            <Icon name="down" size={12} />
          </button>
          <span className="tool-divider" />
          <button
            className={`context-button ${context.length ? "included" : ""}`}
            onClick={() => {
              if (!positions.length)
                setToast(
                  "Supply to a sample market to create your first tracked position."
                )
              else setContext(context.length ? [] : positions.map((p) => p.id))
            }}
          >
            <Icon name="plus" size={15} />
            <span>{context.length ? "Portfolio included" : "Add context"}</span>
          </button>
        </div>
        <button
          className="send-button"
          disabled={!draft.trim() || isBusy}
          onClick={send}
          aria-label="Send research question"
        >
          <Icon name="up" size={20} />
        </button>
      </div>
      {researchError && (
        <p role="alert" className="composer-error">
          {researchError}
        </p>
      )}
    </div>
  )
  function lendingTable(rows: Market[], research = false) {
    return (
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Asset / Protocol</th>
              <th>Network</th>
              <th>
                <button className="sort-button" onClick={() => setSort(!sort)}>
                  {research ? "7-day avg. APY" : "Supply APY"}{" "}
                  <Icon name="down" size={12} />
                </button>
              </th>
              <th>{research ? "Current APY" : "7-day trend"}</th>
              <th>Available liquidity</th>
              <th>Utilization</th>
              <th aria-label="Open opportunity" />
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id} onClick={() => setOpportunity(m)}>
                <td>
                  <button
                    className="asset-cell"
                    onClick={(e) => {
                      e.stopPropagation()
                      setOpportunity(m)
                    }}
                  >
                    <Token asset={m.asset} />
                    <span>
                      <strong>{m.asset}</strong>
                      <small>
                        <span className="aave-dot" />
                        Aave V3
                      </small>
                    </span>
                  </button>
                </td>
                <td>
                  <Chain name={m.chain} />
                </td>
                <td>
                  <strong className="apy">
                    {(research ? m.average : m.apy).toFixed(2)}
                    <span>%</span>
                  </strong>
                </td>
                <td>
                  {research ? (
                    `${m.apy.toFixed(2)}%`
                  ) : (
                    <Sparkline values={m.trend} />
                  )}
                </td>
                <td className="numeric">{m.liquidity}</td>
                <td>
                  <div className="utilization">
                    <span>{m.utilization}%</span>
                    <div>
                      <i style={{ width: `${m.utilization}%` }} />
                    </div>
                  </div>
                </td>
                <td>
                  <Icon name="chevron" size={15} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="empty-results">
            <Icon name="compass" size={30} />
            <h3>No markets match these filters</h3>
            <p>Try another asset or network.</p>
            <button
              className="button secondary"
              onClick={() => {
                setChain("All chains")
                setAsset("All assets")
              }}
            >
              Reset filters
            </button>
          </div>
        )}
      </div>
    )
  }
  function poolTable(rows = filteredPools) {
    return (
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Pool / Protocol</th>
              <th>Network</th>
              <th>Fee tier</th>
              <th>7-day fees</th>
              <th>7-day volume</th>
              <th>TVL</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td>
                  <button
                    className="asset-cell"
                    onClick={() => {
                      navigate("Discover")
                      fill(
                        `Research ${p.pair} on Uniswap V3 on ${p.chain} over the last seven days, including fees and impermanent loss.`
                      )
                    }}
                  >
                    <span className="pair-token">
                      <Token asset="ETH" />
                      <Token
                        asset={p.pair.includes("USDT") ? "USDT" : "USDC"}
                        small
                      />
                    </span>
                    <span>
                      <strong>{p.pair}</strong>
                      <small>
                        <span className="uniswap-dot" />
                        Uniswap V3
                      </small>
                    </span>
                  </button>
                </td>
                <td>
                  <Chain name={p.chain} />
                </td>
                <td>{p.tier}</td>
                <td className="apy">{p.fees}</td>
                <td>{p.volume}</td>
                <td>{p.tvl}</td>
                <td>
                  <button
                    className="icon-button"
                    aria-label={`Inspect ${p.chain} pool evidence`}
                    onClick={() => setModal("evidence")}
                  >
                    <Icon name="chevron" size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <div className="empty-results">
            <h3>No pools match these filters</h3>
            <button
              className="button secondary"
              onClick={() => {
                setChain("All chains")
                setAsset("All assets")
              }}
            >
              Reset filters
            </button>
          </div>
        )}
      </div>
    )
  }
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "mobile-open" : ""}`}>
        <a
          className="brand-link"
          href="#discover"
          onClick={(e) => {
            e.preventDefault()
            navigate("Discover")
          }}
        >
          <Brand />
        </a>
        <button
          className="new-research"
          onClick={() => {
            setActiveThread(null)
            setDraft("")
            setContext([])
            setProgress(-1)
            navigate("Research")
            setTimeout(
              () =>
                document
                  .querySelector<HTMLTextAreaElement>("#research-question")
                  ?.focus(),
              50
            )
          }}
        >
          <Icon name="plus" size={17} />
          New research <kbd>N</kbd>
        </button>
        <nav aria-label="Main navigation">
          {(
            [
              { name: "Discover", icon: "compass" },
              { name: "Research", icon: "chat" },
              { name: "Portfolio", icon: "wallet" },
              { name: "AI access", icon: "spark" },
            ] as { name: Page; icon: string }[]
          ).map((item) => (
            <button
              key={item.name}
              className={page === item.name ? "nav-item active" : "nav-item"}
              onClick={() => navigate(item.name)}
            >
              <Icon name={item.icon} size={19} />
              {item.name}
              {item.name === "AI access" && (
                <span className={`nav-status ${access ? "connected" : ""}`} />
              )}
            </button>
          ))}
        </nav>
        <div className="recent">
          <div className="sidebar-label">
            RECENT RESEARCH <Icon name="clock" size={13} />
          </div>
          {threads.length ? (
            threads.slice(0, 5).map((t) => (
              <button
                key={t.id}
                className={`recent-item ${activeThread?.id === t.id && page === "Research" ? "selected" : ""}`}
                onClick={() => openThread(t)}
              >
                <Icon name="chat" size={14} />
                <span>{t.question}</span>
              </button>
            ))
          ) : (
            <>
              <p className="recent-placeholder">Good questions belong here.</p>
              <p className="recent-description">
                Your research history will appear as you explore.
              </p>
            </>
          )}
        </div>
        <div className="sidebar-bottom">
          <div className="agent-status">
            <div className="agent-status-title">
              <span className={`status-dot ${access ? "" : "idle"}`} />
              {access ? "Your agent is ready" : "A little help, on your terms"}
            </div>
            <p>
              {access
                ? `${access.type === "own" ? "My subscription" : "Pay per request"} · ${access.model}`
                : "Bring your AI subscription or pay as you explore."}
            </p>
            <button
              onClick={() => {
                setSendAfterSetup(false)
                setModal("access")
              }}
            >
              {access ? "Manage connection" : "Set up AI access"}
              <Icon name="arrow" size={14} />
            </button>
          </div>
          <button
            className={`secondary-nav ${page === "Shared access" ? "active" : ""}`}
            onClick={() => navigate("Shared access")}
          >
            <Icon name="network" size={17} />
            Shared access<span>Concept</span>
          </button>
          <div className="sidebar-footer">
            <button onClick={() => setModal("help")}>
              <Icon name="book" size={16} />
              Quick guide
            </button>
            <button
              className="icon-button"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label="Toggle color theme"
            >
              <Icon name={theme === "dark" ? "sun" : "moon"} size={17} />
            </button>
          </div>
        </div>
      </aside>
      {mobileNav && (
        <button
          className="nav-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileNav(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-title">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobileNav(true)}
            >
              <Icon name="menu" />
            </button>
            <span>{page}</span>
            <span className="topbar-divider" />
            <span className="workspace-label">Your DeFi decision desk</span>
          </div>
          <div className="topbar-actions">
            <span className="sample-label">
              <span />
              Sample data
            </span>
            <button
              className={`button wallet-button ${connected ? "wallet-connected" : ""}`}
              onClick={() => setModal("wallet")}
            >
              <Icon name="wallet" size={16} />
              {connected ? "0x71C...9A42" : "Connect wallet"}
            </button>
          </div>
        </header>
        <main>
          <div
            className={`page-content ${page === "Research" ? "research-page" : ""}`}
          >
            {page === "Discover" && (
              <>
                <section className="discovery-intro">
                  <div className="eyebrow">
                    <Icon name="spark" size={15} /> LESS NOISE. MORE
                    UNDERSTANDING.
                  </div>
                  <h1>
                    Make your next move
                    <br />
                    <span>an informed one.</span>
                  </h1>
                  <p>Ask, compare, act on DeFi. Start with a good question.</p>
                  {composerUI}
                  <div className="composer-caption">
                    <Icon name="shield" size={13} />
                    <span>
                      Research first. Your wallet always has the final say.
                    </span>
                  </div>
                </section>
                <section className="starters-section">
                  <div className="section-heading">
                    <h2>A few places to start</h2>
                    <span>Follow a question, not a headline.</span>
                  </div>
                  <div className="starter-grid">
                    {starters.map((s) => (
                      <button
                        className={`starter-card ${s.tone}`}
                        key={s.title}
                        onClick={() => fill(s.question)}
                      >
                        <span className="starter-icon">
                          <Icon name={s.icon} size={21} />
                        </span>
                        <h3>{s.title}</h3>
                        <p>{s.text}</p>
                        <Icon
                          className="starter-arrow"
                          name="arrow"
                          size={17}
                        />
                      </button>
                    ))}
                  </div>
                </section>
                <section className="markets-section">
                  <div className="section-heading market-heading">
                    <div>
                      <h2>A closer look at the market</h2>
                      <p>
                        A starting point for research. Every number has a
                        source.
                      </p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => setModal("evidence")}
                    >
                      Source coverage <Icon name="external" size={14} />
                    </button>
                  </div>
                  <div className="market-panel">
                    <div className="market-toolbar">
                      <div className="tabs">
                        {["Stablecoin supply", "Liquidity pools"].map((t) => (
                          <button
                            key={t}
                            className={tab === t ? "active" : ""}
                            onClick={() => {
                              setTab(t)
                              setWindow("7 days")
                            }}
                          >
                            <Icon
                              name={
                                t === "Stablecoin supply" ? "coins" : "chart"
                              }
                              size={16}
                            />
                            {t}
                          </button>
                        ))}
                      </div>
                      <div className="filters">
                        <label className="filter">
                          <Icon name="globe" size={13} />
                          <select
                            aria-label="Filter by chain"
                            value={chain}
                            onChange={(e) => setChain(e.target.value)}
                          >
                            <option>All chains</option>
                            <option>Ethereum</option>
                            <option>Base</option>
                            <option>Arbitrum</option>
                          </select>
                        </label>
                        <label className="filter">
                          <select
                            aria-label="Filter by asset"
                            value={asset}
                            onChange={(e) => setAsset(e.target.value)}
                          >
                            <option>All assets</option>
                            <option>USDC</option>
                            <option>USDT</option>
                            <option>DAI</option>
                          </select>
                        </label>
                        <label className="filter">
                          <Icon name="clock" size={13} />
                          <select
                            aria-label="Observation window"
                            value={window}
                            onChange={(e) => setWindow(e.target.value)}
                          >
                            <option>7 days</option>
                            <option>Current</option>
                          </select>
                        </label>
                      </div>
                    </div>
                    {preview === "Source unavailable" ? (
                      <div className="empty-results">
                        <h3>This sample source is unavailable</h3>
                        <p>
                          Reset the state preview to Normal to restore the
                          sample market table and send new research.
                        </p>
                        <button
                          className="button secondary"
                          onClick={() => setPreview("Normal")}
                        >
                          Reset preview
                        </button>
                      </div>
                    ) : preview === "Empty results" ? (
                      <div className="empty-results">
                        <h3>No comparable data in this sample</h3>
                        <button
                          className="button secondary"
                          onClick={() => setPreview("Normal")}
                        >
                          Reset preview
                        </button>
                      </div>
                    ) : refreshing || preview === "Loading" ? (
                      <div
                        className="skeleton-table"
                        role="status"
                        aria-label="Loading sample markets"
                      >
                        {[1, 2, 3, 4, 5].map((i) => (
                          <div key={i} />
                        ))}
                      </div>
                    ) : tab === "Stablecoin supply" ? (
                      lendingTable(filtered)
                    ) : window === "Current" ? (
                      <div className="empty-results">
                        <h3>Pool fees need an observation period</h3>
                        <p>Select seven days to compare fee generation.</p>
                        <button
                          className="button secondary"
                          onClick={() => setWindow("7 days")}
                        >
                          Use 7-day window
                        </button>
                      </div>
                    ) : (
                      poolTable()
                    )}
                    <div className="table-footer">
                      <span>
                        <span
                          className={`status-dot ${preview === "Stale data" ? "stale" : ""}`}
                        />
                        {preview === "Stale data"
                          ? "Stale sample: 24 hours old"
                          : "Sample snapshot: Sep 5, 09:41 UTC"}
                        <button
                          className="icon-button"
                          onClick={refresh}
                          aria-label="Refresh sample data"
                        >
                          <Icon name="refresh" size={12} />
                        </button>
                      </span>
                      <span>
                        {tab === "Stablecoin supply"
                          ? `Current variable APY. Incentives excluded.${window === "Current" ? " Trend is prior 7 days." : ""}`
                          : "Trading fees are not net returns."}
                      </span>
                    </div>
                  </div>
                </section>
                <section className="research-note">
                  <span className="note-icon">
                    <Icon name="book" size={23} />
                  </span>
                  <div>
                    <h3>Good research shows its work.</h3>
                    <p>
                      See the sources, assumptions, and tradeoffs behind every
                      answer.
                    </p>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => setModal("evidence")}
                  >
                    How we compare <Icon name="arrow" size={16} />
                  </button>
                </section>
                <footer className="page-footer">
                  <span>Built for curiosity. Designed for clarity.</span>
                  <span>
                    The Graph <span>/</span> Aave <span>/</span> Uniswap
                  </span>
                </footer>
              </>
            )}
            {page === "Research" && (
              <>
                {!activeThread ? (
                  <div className="research-empty">
                    <Brand small />
                    <span className="eyebrow">
                      A QUESTION IS A GOOD BEGINNING
                    </span>
                    <h1>
                      What would you like
                      <br />
                      to understand?
                    </h1>
                    <p className="muted">
                      Explore a market, compare an opportunity, or follow a
                      hunch.
                    </p>
                    {composerUI}
                    <div className="research-suggestions">
                      {starters.map((s) => (
                        <button key={s.title} onClick={() => fill(s.question)}>
                          {s.title}
                          <Icon name="arrow" size={15} />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="thread-header">
                      <span className="eyebrow">
                        RESEARCH NOTE /{" "}
                        {new Date(activeThread.date).toLocaleDateString(
                          "en-US",
                          { month: "short", day: "numeric" }
                        )}
                      </span>
                      <button
                        className="text-button"
                        onClick={() => {
                          navigator.clipboard
                            .writeText(activeThread.question)
                            .then(() => setToast("Research question copied."))
                            .catch(() =>
                              setToast(
                                "Clipboard unavailable. Select the question to copy it."
                              )
                            )
                        }}
                      >
                        <Icon name="copy" size={15} />
                        Copy question
                      </button>
                    </div>
                    <h1 className="question-title">{activeThread.question}</h1>
                    <div className="constraint-chips">
                      <span>
                        {activeThread.kind === "amm" ? "Uniswap V3" : "Aave V3"}
                      </span>
                      <span>
                        {researchNetworks}{" "}
                        {researchNetworks === 1 ? "chain" : "chains"}
                      </span>
                      <span>Aug 30 to Sep 5, 2026</span>
                      <span>Incentives excluded</span>
                      {activeThread.context > 0 && (
                        <span>{activeThread.context} positions included</span>
                      )}
                      <button onClick={() => fill(activeThread.question)}>
                        Edit question <Icon name="sliders" size={13} />
                      </button>
                    </div>
                    <div className="research-progress" aria-live="polite">
                      <div>
                        <Brand small />
                        <strong>
                          {isBusy
                            ? [
                                "Understanding your question",
                                "Fetching sample protocol data",
                                "Comparing eligible markets",
                                "Checking constraints",
                              ][progress]
                            : "Research complete"}
                        </strong>
                        {!isBusy && <span className="pill">4 sources</span>}
                        {isBusy ? (
                          <span className="spinner" />
                        ) : (
                          <Icon name="check" size={17} />
                        )}
                      </div>
                      <details open={isBusy}>
                        <summary>
                          {isBusy
                            ? "View research progress"
                            : `Compared ${researchNetworks} networks with a consistent observation window`}
                        </summary>
                        <ul>
                          {[
                            "Read the request and its constraints",
                            "Load sample protocol snapshots",
                            "Normalize comparable metrics",
                            "Check risks and prepare the result",
                          ].map((s, i) => (
                            <li key={s} className={progress >= i ? "done" : ""}>
                              <Icon
                                name={progress > i ? "check" : "clock"}
                                size={14}
                              />
                              {s}
                            </li>
                          ))}
                        </ul>
                      </details>
                    </div>
                    {!isBusy && (
                      <div className="research-answer">
                        <div className="answer-label">
                          <Icon name="spark" size={18} />
                          <span>THE FINDINGS</span>
                          <span className="pill amber">Sample analysis</span>
                        </div>
                        <h2>
                          {activeThread.kind === "amm"
                            ? "More fees do not always mean more return."
                            : topResearch
                              ? `${topResearch.chain} ${topResearch.asset} supply, with the numbers in view.`
                              : "No comparable sample markets match this question."}
                        </h2>
                        <p className="answer-lede">
                          {activeThread.kind === "amm"
                            ? `This sample covers ${researchPools.length} eligible Uniswap V3 pools. Fee generation depends on trading volume and fee tier. Concentrated liquidity and changing token prices affect the outcome for an individual position.`
                            : researchMarkets.length
                              ? `${researchMarkets.map((m) => `${m.asset} on ${m.chain} averaged ${m.average.toFixed(2)}%`).join("; ")}. These seven-day sample averages exclude incentives. Current rates are variable.`
                              : "Try USDC on Base, Arbitrum, or Ethereum. The prototype excludes unsupported combinations instead of inventing figures."}
                        </p>
                        <div className="market-panel result-table">
                          {activeThread.kind === "amm" ? (
                            <>
                              <div className="notice">
                                Trading fees are not net returns. Sample
                                seven-day data.
                              </div>
                              {poolTable(researchPools)}
                            </>
                          ) : (
                            lendingTable(
                              [...researchMarkets].sort((a, b) =>
                                sort
                                  ? b.average - a.average
                                  : a.average - b.average
                              ),
                              true
                            )
                          )}
                        </div>
                        <div className="findings-grid">
                          <div>
                            <h3>
                              <Icon name="chart" size={17} />
                              The calculation
                            </h3>
                            <p>
                              {activeThread.kind === "amm"
                                ? "Fees equal period trading volume multiplied by the pool fee tier. This excludes incentive rewards and does not measure an individual LP return."
                                : topResearch
                                  ? `At a constant ${topResearch.average.toFixed(2)}% sample APY, 10,000 ${topResearch.asset} would earn ${money(topResearch.average * 100)} ${topResearch.asset} over one year, before costs. This assumes rates stay fixed; actual supply rates change.`
                                  : "No calculation is available for unsupported sample markets."}
                            </p>
                          </div>
                          <div>
                            <h3>
                              <Icon name="shield" size={17} />
                              The tradeoff
                            </h3>
                            <p>
                              {activeThread.kind === "amm"
                                ? "Your outcome depends on the chosen price range, time in range, changing token prices, gas, and impermanent loss."
                                : "Base has less available liquidity and introduces L2 network risk. Moving from another chain adds bridge costs and risk. Rates can change at any time."}
                            </p>
                          </div>
                        </div>
                        <details className="assumptions">
                          <summary>Assumptions & coverage limits</summary>
                          <p>
                            USDC is assumed to retain its peg. Example figures
                            cover only the supported markets listed here. No
                            missing markets are ranked. No gas or bridging costs
                            are included in annualized comparisons. This is
                            sample analysis, not personalized financial advice.
                          </p>
                        </details>
                        <button
                          className="evidence-link"
                          onClick={() => setModal("evidence")}
                        >
                          <span className="source-stack">
                            <span>a</span>
                            <span>G</span>
                          </span>
                          <span>
                            Inspect sources & methodology
                            <small>
                              Sample snapshot · Sep 5, 2026, 09:41 UTC
                            </small>
                          </span>
                          <Icon name="arrow" size={17} />
                        </button>
                        {activeThread.kind === "lending" && topResearch && (
                          <div className="next-step">
                            <div className="next-step-icon">
                              <Icon name="coins" size={24} />
                            </div>
                            <div>
                              <span className="eyebrow">
                                ONE POSSIBLE NEXT STEP
                              </span>
                              <h3>
                                Take a closer look at {topResearch.asset} on{" "}
                                {topResearch.chain}
                              </h3>
                              <p>
                                Review the market and prepare a simulated
                                supply.
                              </p>
                            </div>
                            <button
                              className="button primary"
                              onClick={() => setOpportunity(topResearch)}
                            >
                              Explore opportunity{" "}
                              <Icon name="arrow" size={16} />
                            </button>
                          </div>
                        )}
                        <div className="answer-receipt">
                          <Icon name="check" size={13} />
                          {activeThread.model} <span>/</span>
                          {activeThread.cost
                            ? `Settled: ${activeThread.cost.toFixed(2)} USDC · demo:${activeThread.id.slice(0, 8)}`
                            : "Own subscription · no research charge"}
                          <span>/</span>Saved in this browser
                        </div>
                      </div>
                    )}
                    {composerUI}
                    <p className="composer-caption">
                      {contextPositions.length
                        ? `${contextPositions.length} positions will be included in your next request.`
                        : "Portfolio context is off. Add it only when you need it."}
                    </p>
                  </>
                )}
              </>
            )}
            {page === "Portfolio" && (
              <>
                <div className="page-intro">
                  <span className="eyebrow">
                    YOUR POSITIONS, IN PERSPECTIVE
                  </span>
                  <h1>A little more perspective.</h1>
                  <p>Keep track of your moves. Understand what changes.</p>
                </div>
                <div className="section-heading">
                  <h2>
                    Tracked positions{" "}
                    <span className="count-badge">{positions.length}</span>
                  </h2>
                  <span className="pill">
                    <Icon name="shield" size={13} />
                    Tracked in this browser
                  </span>
                </div>
                {!connected ? (
                  <div className="large-empty">
                    <span className="empty-icon">
                      <Icon name="wallet" size={32} />
                    </span>
                    <h2>Your portfolio starts with your wallet.</h2>
                    <p>
                      Connect a demo wallet to explore positions.
                      <br />
                      Connecting does not let the agent read your portfolio.
                    </p>
                    <button
                      className="button primary"
                      onClick={() => setModal("wallet")}
                    >
                      Connect demo wallet <Icon name="arrow" size={16} />
                    </button>
                  </div>
                ) : !walletRead ? (
                  <div className="large-empty">
                    <span className="empty-icon">
                      <Icon name="shield" size={32} />
                    </span>
                    <h2>Connected. You're in control.</h2>
                    <p>
                      Allow this view to read the demo wallet and your locally
                      tracked positions.
                      <br />
                      Portfolio context stays off in research until you include
                      it.
                    </p>
                    <button
                      className="button primary"
                      onClick={() => setWalletRead(true)}
                    >
                      Read demo portfolio <Icon name="arrow" size={16} />
                    </button>
                  </div>
                ) : !positions.length ? (
                  <div className="large-empty">
                    <span className="empty-icon">
                      <Icon name="coins" size={32} />
                    </span>
                    <h2>Your first position is a question away.</h2>
                    <p>
                      No locally tracked positions yet. Explore a market and
                      complete a simulated supply to see it here.
                    </p>
                    <button
                      className="button primary"
                      onClick={() => navigate("Discover")}
                    >
                      Discover opportunities <Icon name="arrow" size={16} />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="portfolio-summary">
                      <div>
                        <span>Locally tracked value</span>
                        <strong>
                          $
                          {money(
                            positions.reduce((sum, p) => sum + p.amount, 0)
                          )}
                        </strong>
                        <small>Sample stablecoins valued at $1</small>
                      </div>
                      <div>
                        <span>Tracked positions</span>
                        <strong>
                          {positions.length.toString().padStart(2, "0")}
                        </strong>
                        <small>
                          Across{" "}
                          {
                            new Set(
                              positions.map(
                                (p) =>
                                  markets.find((m) => m.id === p.marketId)
                                    ?.chain
                              )
                            ).size
                          }{" "}
                          networks
                        </small>
                      </div>
                      <button className="button secondary" onClick={refresh}>
                        <Icon name="refresh" size={15} />
                        {refreshing ? "Refreshing..." : "Refresh samples"}
                      </button>
                    </div>
                    <div className="portfolio-actions">
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={selected.length === positions.length}
                          onChange={(e) =>
                            setSelected(
                              e.target.checked ? positions.map((p) => p.id) : []
                            )
                          }
                        />
                        Select all positions
                      </label>
                      <button
                        className="button primary"
                        disabled={!selected.length}
                        onClick={() => {
                          setContext(selected)
                          setActiveThread(null)
                          setProgress(-1)
                          navigate("Research")
                          fill(
                            "Which of my tracked positions changed the most, and how do their current USDC supply rates compare?"
                          )
                        }}
                      >
                        Include in research{" "}
                        {selected.length > 0 && `(${selected.length})`}
                        <Icon name="arrow" size={15} />
                      </button>
                    </div>
                    {["Base", "Arbitrum", "Ethereum"].map((network) => {
                      const group = positions.filter(
                        (p) =>
                          markets.find((m) => m.id === p.marketId)?.chain ===
                          network
                      )
                      return (
                        group.length > 0 && (
                          <section className="position-group" key={network}>
                            <h3>
                              Aave V3 <Chain name={network} />
                            </h3>
                            {group.map((p) => {
                              const market = markets.find(
                                (m) => m.id === p.marketId
                              )!
                              return (
                                <div className="position-row" key={p.id}>
                                  <input
                                    aria-label={`Select ${p.amount} ${market.asset} on ${network}`}
                                    type="checkbox"
                                    checked={selected.includes(p.id)}
                                    onChange={(e) =>
                                      setSelected(
                                        e.target.checked
                                          ? [...selected, p.id]
                                          : selected.filter((id) => id !== p.id)
                                      )
                                    }
                                  />
                                  <Token asset={market.asset} />
                                  <div>
                                    <strong>{market.asset} supply</strong>
                                    <small className="mono">
                                      {p.reference}
                                    </small>
                                  </div>
                                  <div>
                                    <strong>
                                      {money(p.amount)} {market.asset}
                                    </strong>
                                    <small>
                                      Supplied{" "}
                                      {new Date(p.date).toLocaleDateString()}
                                    </small>
                                  </div>
                                  <div>
                                    <strong className="apy">
                                      {market.apy}%
                                    </strong>
                                    <small>Current sample APY</small>
                                  </div>
                                  <span className="pill green">
                                    {refreshed
                                      ? "Sample refreshed"
                                      : "Locally tracked"}
                                  </span>
                                  <a
                                    className="icon-button"
                                    aria-label="Open Aave"
                                    href="https://app.aave.com/"
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    <Icon name="external" size={16} />
                                  </a>
                                </div>
                              )
                            })}
                          </section>
                        )
                      )
                    })}
                  </>
                )}
                <div className="notice storage-notice">
                  <Icon name="info" size={18} />
                  <span>
                    Positions and research history are stored in this browser.
                    Clearing browser data removes them. This prototype does not
                    reconcile your complete on-chain portfolio.
                  </span>
                </div>
              </>
            )}
            {page === "AI access" && (
              <>
                <div className="page-intro">
                  <span className="eyebrow">INTELLIGENCE, ON YOUR TERMS</span>
                  <h1>Your research companion.</h1>
                  <p>
                    A familiar subscription or a small budget. The same place to
                    think.
                  </p>
                </div>
                <div className="access-page-grid">
                  <div className="settings-panel">
                    <div className="section-heading">
                      <h2>Agent connection</h2>
                      <span className={`pill ${access ? "green" : ""}`}>
                        {access ? "Demo connected" : "Not connected"}
                      </span>
                    </div>
                    <div className="settings-icon">
                      <Icon name="spark" size={30} />
                    </div>
                    <h3>
                      {access
                        ? access.type === "own"
                          ? "Your own subscription"
                          : "Pay per request"
                        : "Choose your AI access"}
                    </h3>
                    <p className="muted">
                      {access
                        ? "Your connection is simulated. All research uses local sample data."
                        : "Connect your local Claude Code or Codex runtime, or approve a capped research budget."}
                    </p>
                    {access && (
                      <>
                        <label className="field-label" htmlFor="settings-model">
                          Selected model
                        </label>
                        <select
                          id="settings-model"
                          value={access.model}
                          onChange={(e) =>
                            setAccess({ ...access, model: e.target.value })
                          }
                        >
                          <option>Claude Sonnet</option>
                          <option>Claude Opus</option>
                          <option>GPT research</option>
                        </select>
                        <dl className="detail-list">
                          <div>
                            <dt>Runtime status</dt>
                            <dd>Demo connected</dd>
                          </div>
                          <div>
                            <dt>Reported usage limits</dt>
                            <dd>Unavailable in prototype</dd>
                          </div>
                        </dl>
                      </>
                    )}
                    <button
                      className="button primary"
                      onClick={() => {
                        setSendAfterSetup(false)
                        setModal("access")
                      }}
                    >
                      {access ? "Change access method" : "Set up AI access"}
                      <Icon name="arrow" size={16} />
                    </button>
                    {access && (
                      <button
                        className="text-button"
                        onClick={() => {
                          setAccess(null)
                          setToast("Demo runtime disconnected.")
                        }}
                      >
                        Disconnect
                      </button>
                    )}
                  </div>
                  <div className="settings-panel">
                    <div className="section-heading">
                      <h2>Research spending</h2>
                      <Icon name="coins" size={19} />
                    </div>
                    <div className="spending-total">
                      {access?.type === "paid"
                        ? access.spent.toFixed(2)
                        : "0.00"}
                      <span>USDC</span>
                    </div>
                    <p className="muted">Total simulated spend</p>
                    {access?.type === "paid" ? (
                      <>
                        <div className="budget-bar">
                          <i
                            style={{
                              width: `${Math.min(100, (access.spent / access.budget) * 100)}%`,
                            }}
                          />
                        </div>
                        <p className="micro">
                          {money(access.budget - access.spent)} USDC remaining
                          of your {money(access.budget)} USDC cap
                        </p>
                        <label className="field-label" htmlFor="edit-cap">
                          Maximum total budget in USDC
                        </label>
                        <input
                          id="edit-cap"
                          type="number"
                          min={access.spent}
                          step="0.01"
                          defaultValue={access.budget}
                          onBlur={(e) => {
                            const value = Number(e.target.value)
                            if (
                              Number.isFinite(value) &&
                              value >= access.spent
                            ) {
                              setAccess({ ...access, budget: value })
                              setToast("Demo research budget updated.")
                            } else {
                              e.target.value = String(access.budget)
                              setToast(
                                "The cap cannot be less than settled spending."
                              )
                            }
                          }}
                        />
                      </>
                    ) : (
                      <p className="micro">
                        Your own subscription has no per-request Cool Bar charge
                        in this prototype. Provider usage limits still apply in
                        the intended product.
                      </p>
                    )}
                    <div className="notice">
                      <Icon name="shield" size={17} />
                      <span>
                        Research spending is separate from network fees and
                        protocol transactions.
                      </span>
                    </div>
                  </div>
                </div>
                <div className="settings-panel receipts">
                  <h2>Research receipts</h2>
                  {threads.some((t) => t.cost) ? (
                    threads
                      .filter((t) => t.cost)
                      .map((t) => (
                        <div className="receipt-row" key={t.id}>
                          <span className="receipt-icon">
                            <Icon name="check" size={16} />
                          </span>
                          <div>
                            <strong>{t.question}</strong>
                            <small className="mono">
                              demo:{t.id.slice(0, 8)} · Hedera settlement
                              concept
                            </small>
                          </div>
                          <span>{t.cost.toFixed(2)} USDC</span>
                          <span className="pill green">Demo settled</span>
                        </div>
                      ))
                  ) : (
                    <p className="muted">
                      No paid research yet. Completed demo requests and
                      settlement references will appear here.
                    </p>
                  )}
                </div>
              </>
            )}
            {page === "Shared access" && (
              <>
                <div className="page-intro">
                  <span className="eyebrow">ARCHITECTURE CONCEPT</span>
                  <h1>A network with room to share.</h1>
                  <p>
                    An exploration of provider-approved API capacity and
                    dedicated agent endpoints.
                  </p>
                </div>
                <div className="notice">
                  <Icon name="info" size={19} />
                  <span>
                    This is a concept, not an available marketplace. Consumer
                    subscription resale is not supported. All availability,
                    usage, and earnings below are illustrative.
                  </span>
                </div>
                <div className="concept-stats">
                  <div>
                    <span>Example earnings</span>
                    <strong>
                      24.80 <small>USDC</small>
                    </strong>
                    <p>Sample settled amount</p>
                  </div>
                  <div>
                    <span>Example invocations</span>
                    <strong>124</strong>
                    <p>Within a 200-request daily limit</p>
                  </div>
                  <div>
                    <span>Endpoint availability</span>
                    <strong>{sharing ? "Available" : "Paused"}</strong>
                    <p>
                      {sharing
                        ? "Accepting conceptual requests"
                        : "No new work accepted"}
                    </p>
                  </div>
                </div>
                <div className="settings-panel">
                  <div className="section-heading">
                    <h2>Dedicated research endpoint</h2>
                    <span className="pill">Concept</span>
                  </div>
                  <div className="sharing-control">
                    <span className="settings-icon">
                      <Icon name="network" size={27} />
                    </span>
                    <div>
                      <h3>Provider-approved API capacity</h3>
                      <p className="muted">
                        Permitted model: Claude Sonnet · Example rate: 0.02 USDC
                        / step
                      </p>
                    </div>
                    <button
                      role="switch"
                      aria-checked={sharing}
                      aria-label="Toggle conceptual sharing"
                      className={`toggle ${sharing ? "on" : ""}`}
                      onClick={() => {
                        setSharing(!sharing)
                        setToast(
                          sharing
                            ? "Concept paused. In-flight requests may finish; new requests stop."
                            : "Concept enabled. No real endpoint is exposed."
                        )
                      }}
                    >
                      <i />
                    </button>
                  </div>
                  <label className="field-label" htmlFor="availability">
                    Example availability
                  </label>
                  <select
                    id="availability"
                    value={availability}
                    onChange={(e) => setAvailability(e.target.value)}
                  >
                    <option>8 hours / day</option>
                    <option>24 hours / day</option>
                    <option>Weekdays only</option>
                  </select>
                  <p className="micro">
                    Turning sharing off stops new work. Already accepted
                    requests may complete within their existing limits.
                  </p>
                </div>
                <div className="settings-panel receipts">
                  <h2>Illustrative activity</h2>
                  {[
                    { id: "req-0124", state: "Settled", cost: "0.20" },
                    {
                      id: "req-0123",
                      state: "Settlement pending",
                      cost: "0.16",
                    },
                  ].map((r) => (
                    <div className="receipt-row" key={r.id}>
                      <Icon name="network" size={18} />
                      <div>
                        <strong>Market comparison</strong>
                        <small className="mono">concept:{r.id}</small>
                      </div>
                      <span>{r.cost} USDC</span>
                      <span className="pill">{r.state}</span>
                    </div>
                  ))}
                </div>
                <p className="micro">
                  A real provider network would require provider permission,
                  consent, usage controls, and billing accountability.
                  Encryption or runtime attestation alone does not establish
                  provider trust.
                </p>
              </>
            )}
          </div>
          <div className="prototype-footer">
            <span>
              Cool Bar interactive prototype. No real funds or live data.
            </span>
            <label>
              Preview state
              <select
                aria-label="Preview prototype state"
                value={preview}
                onChange={(e) => setPreview(e.target.value)}
              >
                {[
                  "Normal",
                  "Loading",
                  "Empty results",
                  "Stale data",
                  "Source unavailable",
                ].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
          </div>
        </main>
      </div>
      {modal === "access" && (
        <AccessSetup
          onClose={() => {
            setModal(null)
            setSendAfterSetup(false)
          }}
          onComplete={(next) => {
            setAccess(next)
            setModal(null)
            if (sendAfterSetup) runResearch(next)
            else setToast("Your demo agent is connected.")
            setSendAfterSetup(false)
          }}
        />
      )}
      {modal === "evidence" && <Evidence onClose={() => setModal(null)} />}
      {modal === "wallet" && (
        <Modal
          title={connected ? "Your demo wallet" : "Connect a wallet"}
          onClose={() => setModal(null)}
        >
          <div className="modal-body">
            <span className="pill amber">Simulated connection</span>
            <p className="muted">
              Explore the full experience with a demo wallet. No extension,
              signature, or real funds required.
            </p>
            {connected ? (
              <>
                <div className="wallet-address">
                  <Icon name="wallet" size={28} />
                  <strong className="mono">0x71C...9A42</strong>
                  <span className="pill green">Demo connected</span>
                </div>
                <button
                  className="button secondary full"
                  onClick={() => {
                    setConnected(false)
                    setWalletRead(false)
                    setContext([])
                    setModal(null)
                    setToast("Demo wallet disconnected.")
                  }}
                >
                  Disconnect demo wallet
                </button>
              </>
            ) : (
              <>
                {["Browser wallet", "WalletConnect", "Coinbase Wallet"].map(
                  (w, i) => (
                    <button
                      className="wallet-option"
                      key={w}
                      onClick={() => {
                        setConnected(true)
                        setModal(null)
                        setToast(
                          "Demo wallet connected. Portfolio access remains off."
                        )
                      }}
                    >
                      <span className={`wallet-provider provider-${i}`}>
                        <Icon name={i === 1 ? "link" : "wallet"} size={23} />
                      </span>
                      <div>
                        <strong>{w}</strong>
                        <small>Try with a demo connection</small>
                      </div>
                      <Icon name="chevron" size={17} />
                    </button>
                  )
                )}
              </>
            )}
            <div className="notice">
              <Icon name="shield" size={18} />
              <span>
                Connecting a wallet does not share portfolio data with the
                agent. You choose when to include it.
              </span>
            </div>
          </div>
        </Modal>
      )}
      {modal === "help" && (
        <Modal
          title="Ask, compare, act on DeFi."
          onClose={() => setModal(null)}
        >
          <div className="modal-body">
            <p className="muted">
              A complete product walkthrough with sample data.
            </p>
            {[
              {
                n: "01",
                title: "Start with a question",
                text: "Choose a prompt on Discover. Edit it, then send when ready.",
              },
              {
                n: "02",
                title: "Choose your research access",
                text: "Simulate your own local AI connection or approve a capped demo budget.",
              },
              {
                n: "03",
                title: "Follow the evidence",
                text: "Compare the result, inspect the sources, and understand the tradeoffs.",
              },
              {
                n: "04",
                title: "Make a considered move",
                text: "Open an opportunity, review an amount, and confirm each step in the demo wallet.",
              },
              {
                n: "05",
                title: "Keep the question going",
                text: "Find the position in Portfolio and explicitly include it in your next question.",
              },
            ].map((s) => (
              <div className="guide-step" key={s.n}>
                <span>{s.n}</span>
                <div>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </div>
              </div>
            ))}
            <p className="micro">
              All activity stays in this browser. No API, contract, live wallet,
              or payment integration is connected.
            </p>
          </div>
        </Modal>
      )}
      {modal === "clarify" && (
        <Modal
          title="Give your research a starting point"
          onClose={() => setModal(null)}
        >
          <div className="modal-body">
            <p className="muted">
              Choose the asset and scope so the comparison uses meaningful
              constraints.
            </p>
            <button
              className="wallet-option"
              onClick={() => {
                setDraft(
                  `${draft} Compare USDC on Base, Arbitrum, and Ethereum over the last seven days.`
                )
                setModal(null)
                document
                  .querySelector<HTMLTextAreaElement>("#research-question")
                  ?.focus()
              }}
            >
              <Token asset="USDC" />
              <div>
                <strong>Stablecoin supply</strong>
                <small>USDC · 3 chains · Last 7 days</small>
              </div>
              <Icon name="arrow" size={17} />
            </button>
            <button
              className="wallet-option"
              onClick={() => {
                setDraft(
                  `${draft} Compare Uniswap V3 ETH stablecoin pool fees over the last seven days on Ethereum.`
                )
                setModal(null)
                document
                  .querySelector<HTMLTextAreaElement>("#research-question")
                  ?.focus()
              }}
            >
              <Token asset="ETH" />
              <div>
                <strong>Liquidity pool research</strong>
                <small>ETH / stablecoin · Ethereum · Last 7 days</small>
              </div>
              <Icon name="arrow" size={17} />
            </button>
            <p className="micro">
              Your updated question will return to the composer for review.
            </p>
          </div>
        </Modal>
      )}
      {opportunity && (
        <Transaction
          market={opportunity}
          connected={connected}
          onConnect={() => {
            setConnected(true)
            setToast("Demo wallet connected. Portfolio context remains off.")
          }}
          onClose={() => setOpportunity(null)}
          onRecord={(p) => setPositions((old) => [p, ...old])}
          onComplete={() => {
            setOpportunity(null)
            setWalletRead(true)
            navigate("Portfolio")
            setToast("Simulated position saved in this browser.")
          }}
        />
      )}
      <div className={`toast ${toast ? "visible" : ""}`} role="status">
        <Icon name="check" size={17} />
        {toast}
      </div>
    </div>
  )
}
export default App
