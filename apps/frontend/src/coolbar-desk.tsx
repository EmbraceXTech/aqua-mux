import { useEffect, useRef, useState } from "react"
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Bookmark,
  Check,
  ChevronDown,
  CircleHelp,
  Command,
  Compass,
  Cpu,
  Menu,
  MessageSquare,
  Moon,
  Network,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sun,
  Wallet,
} from "lucide-react"
import { useTheme } from "@/components/theme-provider"
import { Discover } from "@/components/discover"
import { Research } from "@/components/research"
import { MarketDetail } from "@/components/market-detail"
import {
  AccessModal,
  AccessPage,
  ActivityPage,
  PortfolioPage,
  SharingPage,
} from "@/components/workspace-pages"
import { TransactionModal, WalletModal } from "@/components/transaction-modal"
import {
  BrandMark,
  ChainBadge,
  Modal,
  SampleBadge,
} from "@/components/primitives"
import { markets, starters } from "@/lib/demo-data"
import type { Market } from "@/lib/demo-data"
import { prepareResearch } from "@/lib/research"
import { WorkspaceProvider, useWorkspace } from "@/lib/workspace"
import type { Page, ResearchMessage } from "@/lib/workspace"
import "./desk.css"

const pageNames: Record<Page, string> = {
  discover: "Discover",
  research: "Research",
  portfolio: "Portfolio",
  access: "AI access",
  sharing: "Shared capacity",
  saved: "Saved opportunities",
  activity: "Activity",
}
const primaryNav = [
  { id: "discover", icon: Compass, label: "Discover" },
  { id: "research", icon: MessageSquare, label: "Research" },
  { id: "portfolio", icon: Wallet, label: "Portfolio" },
  { id: "access", icon: Cpu, label: "AI access" },
] as const
function readRoute(): { page: Page; threadId: string | null } {
  const [page, threadId] = window.location.hash.replace(/^#\/?/, "").split("/")
  return {
    page: page in pageNames ? (page as Page) : "discover",
    threadId: threadId ?? null,
  }
}
type Transaction = {
  market: Market
  kind: "supply" | "withdraw" | "swap"
  positionId?: string
}

function WorkspaceApp() {
  const { state, setState, toast, notice, disconnectWallet } = useWorkspace()
  const { theme, setTheme } = useTheme()
  const [route, setRoute] = useState(readRoute)
  const [mobileNav, setMobileNav] = useState(false)
  const [draft, setDraft] = useState("")
  const [includeContext, setIncludeContext] = useState(false)
  const [accessOpen, setAccessOpen] = useState(false)
  const [pendingResearch, setPendingResearch] = useState(false)
  const [walletOpen, setWalletOpen] = useState(false)
  const [walletDetails, setWalletDetails] = useState(false)
  const [transaction, setTransaction] = useState<Transaction | null>(null)
  const [pendingTransaction, setPendingTransaction] =
    useState<Transaction | null>(null)
  const [selectedMarket, setSelectedMarket] = useState<Market | null>(null)
  const [running, setRunning] = useState<{
    threadId: string
    messageId: string
  } | null>(null)
  const [stage, setStage] = useState(0)
  const [commandOpen, setCommandOpen] = useState(false)
  const [commandSearch, setCommandSearch] = useState("")
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [clarifyOpen, setClarifyOpen] = useState(false)
  const [notifications, setNotifications] = useState(false)
  const contentRef = useRef<HTMLElement>(null)
  const page = route.page
  const thread =
    state.threads.find((item) => item.id === route.threadId) ?? null
  const go = (next: Page, threadId: string | null = null) => {
    const hash = `#/${next}${threadId ? `/${threadId}` : ""}`
    if (location.hash !== hash) history.pushState(null, "", hash)
    setRoute({ page: next, threadId })
    setMobileNav(false)
    setNotifications(false)
    contentRef.current?.scrollTo({ top: 0 })
    window.scrollTo({ top: 0 })
  }
  useEffect(() => {
    const handleRoute = () => {
      setRoute(readRoute())
      setMobileNav(false)
    }
    window.addEventListener("popstate", handleRoute)
    window.addEventListener("hashchange", handleRoute)
    return () => {
      window.removeEventListener("popstate", handleRoute)
      window.removeEventListener("hashchange", handleRoute)
    }
  }, [])
  useEffect(() => {
    document.title = `${pageNames[page]} | Cool Bar`
  }, [page])
  useEffect(() => {
    if (!mobileNav) return
    const previous = document.activeElement as HTMLElement | null
    const sidebar = document.querySelector<HTMLElement>(".sidebar")
    sidebar?.querySelector<HTMLElement>(".new-research")?.focus()
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || document.querySelector("dialog[open]")) return
      const controls = [
        ...(sidebar?.querySelectorAll<HTMLElement>(
          "a[href], button:not(:disabled)"
        ) ?? []),
      ]
      const first = controls[0],
        last = controls.at(-1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    window.addEventListener("keydown", trapFocus)
    return () => {
      window.removeEventListener("keydown", trapFocus)
      previous?.focus()
    }
  }, [mobileNav])
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setCommandOpen((open) => !open)
      }
      if (event.key === "Escape") {
        setMobileNav(false)
        setNotifications(false)
      }
      if (
        event.key === "/" &&
        !(
          event.target instanceof HTMLElement &&
          event.target.closest("input, textarea, select, [contenteditable]")
        ) &&
        !document.querySelector("dialog[open]")
      ) {
        event.preventDefault()
        document.getElementById("research-question")?.focus()
      }
      if (
        event.key.toLowerCase() === "n" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !(
          event.target instanceof HTMLElement &&
          event.target.closest("input, textarea, select, [contenteditable]")
        ) &&
        !document.querySelector("dialog[open]")
      ) {
        event.preventDefault()
        setDraft("")
        setIncludeContext(false)
        history.pushState(null, "", "#/research")
        setRoute({ page: "research", threadId: null })
      }
    }
    window.addEventListener("keydown", keyboard)
    return () => window.removeEventListener("keydown", keyboard)
  }, [])
  useEffect(() => {
    if (!running) return
    const interval = window.setInterval(
      () => setStage((value) => Math.min(4, value + 1)),
      620
    )
    const timeout = window.setTimeout(() => {
      setState((current) => {
        const target = current.threads
          .find((item) => item.id === running.threadId)
          ?.messages.find((item) => item.id === running.messageId)
        if (!target || target.complete) return current
        return {
          ...current,
          threads: current.threads.map((item) =>
            item.id === running.threadId
              ? {
                  ...item,
                  messages: item.messages.map((message) =>
                    message.id === running.messageId
                      ? { ...message, complete: true }
                      : message
                  ),
                }
              : item
          ),
          access:
            current.access && target.cost
              ? {
                  ...current.access,
                  spent: Number(
                    (current.access.spent + target.cost).toFixed(2)
                  ),
                }
              : current.access,
          activity: [
            {
              id: target.id,
              type: "Research",
              title: target.prompt,
              amount: target.cost,
              asset: "USDC",
              chain: "Base",
              time: new Date().toISOString(),
              tx: `demo-${target.id.slice(0, 8)}`,
            },
            ...current.activity,
          ],
        }
      })
      setRunning(null)
    }, 3400)
    return () => {
      window.clearInterval(interval)
      window.clearTimeout(timeout)
    }
  }, [running, setState])
  const fillPrompt = (prompt: string, context = false) => {
    setDraft(prompt)
    setIncludeContext(context)
    if (page !== "discover" && page !== "research") go("research")
    requestAnimationFrame(() => {
      document.getElementById("research-question")?.focus()
      document
        .getElementById("research-question")
        ?.scrollIntoView({ behavior: "smooth", block: "center" })
    })
  }
  const sendResearch = () => {
    if (!draft.trim() || running) return
    if (
      /best|yield|lending|stablecoin|opportunit|invest|where|supply/i.test(
        draft
      ) &&
      !/usdc|usdt|eth|pool|uniswap|my positions|portfolio/i.test(draft)
    ) {
      setClarifyOpen(true)
      return
    }
    if (!state.access?.connected) {
      setPendingResearch(true)
      setAccessOpen(true)
      return
    }
    const cost = state.access.mode === "paid" ? 0.04 : 0
    if (cost && state.access.spent + cost > state.access.budget + 0.00001) {
      toast(
        "This request exceeds your approved budget. Increase it in AI access before sending."
      )
      go("access")
      return
    }
    const id = crypto.randomUUID()
    const threadId =
      page === "research" && thread ? thread.id : crypto.randomUUID()
    const message: ResearchMessage = {
      id,
      prompt: draft.trim(),
      ...prepareResearch(draft.trim()),
      context: includeContext,
      positions: includeContext
        ? state.positions.map((position) => ({ ...position }))
        : undefined,
      complete: false,
      cost,
      model: state.access.model,
    }
    setState((current) => ({
      ...current,
      threads: current.threads.some((item) => item.id === threadId)
        ? current.threads.map((item) =>
            item.id === threadId
              ? { ...item, messages: [...item.messages, message] }
              : item
          )
        : [
            {
              id: threadId,
              title:
                message.prompt.length > 60
                  ? `${message.prompt.slice(0, 57)}...`
                  : message.prompt,
              messages: [message],
              createdAt: new Date().toISOString(),
            },
            ...current.threads,
          ],
    }))
    setDraft("")
    setIncludeContext(false)
    setStage(0)
    setRunning({ threadId, messageId: id })
    go("research", threadId)
  }
  const act = (
    market: Market,
    kind: Transaction["kind"] = "supply",
    positionId?: string
  ) => {
    setSelectedMarket(null)
    const next = { market, kind, positionId }
    if (!state.wallet) {
      setPendingTransaction(next)
      setWalletOpen(true)
    } else setTransaction(next)
  }
  const newResearch = () => {
    setDraft("")
    setIncludeContext(false)
    go("research")
  }
  return (
    <div className="app-shell">
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault()
          contentRef.current?.focus()
        }}
      >
        Skip to content
      </a>
      {mobileNav && (
        <button
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileNav(false)}
        />
      )}
      <aside className={`sidebar ${mobileNav ? "mobile-open" : ""}`}>
        <a
          className="brand"
          href="#/discover"
          onClick={(event) => {
            event.preventDefault()
            go("discover")
          }}
          aria-label="Cool Bar home"
        >
          <BrandMark />
          <span>
            cool bar<span className="brand-period">.</span>
          </span>
          <span className="brand-beta">BETA</span>
        </a>
        <p className="brand-tagline">Ask, compare, act on DeFi.</p>
        <button className="new-research" onClick={newResearch}>
          <Plus size={17} />
          New research<kbd>N</kbd>
        </button>
        <div className="nav-group-label">Workspace</div>
        <nav className="primary-nav" aria-label="Main navigation">
          {primaryNav.map(({ id, icon: Icon, label }) => (
            <a
              key={id}
              href={`#/${id}`}
              aria-current={page === id ? "page" : undefined}
              onClick={(event) => {
                event.preventDefault()
                go(id)
              }}
              className={page === id ? "active" : ""}
            >
              <Icon size={19} strokeWidth={1.7} />
              <span>{label}</span>
              {page === id && <span className="nav-active-dot" />}
              {id === "portfolio" && state.positions.length > 0 && (
                <span className="nav-count">{state.positions.length}</span>
              )}
            </a>
          ))}
        </nav>
        <div className="sidebar-secondary">
          <a
            href="#/saved"
            onClick={(event) => {
              event.preventDefault()
              go("saved")
            }}
            className={page === "saved" ? "active" : ""}
          >
            <Bookmark size={16} />
            <span>Saved opportunities</span>
            {state.saved.length > 0 && (
              <span className="nav-count">{state.saved.length}</span>
            )}
          </a>
          <a
            href="#/activity"
            onClick={(event) => {
              event.preventDefault()
              go("activity")
            }}
            className={page === "activity" ? "active" : ""}
          >
            <Activity size={16} />
            <span>Activity</span>
          </a>
        </div>
        <div className="recent-heading">
          <span className="nav-group-label">Recent research</span>
          <button
            className="sidebar-icon"
            aria-label="Start new research"
            onClick={newResearch}
          >
            <Plus size={14} />
          </button>
        </div>
        <div className="recent-threads">
          {state.threads.length ? (
            state.threads.slice(0, 5).map((item) => (
              <a
                key={item.id}
                href={`#/research/${item.id}`}
                onClick={(event) => {
                  event.preventDefault()
                  go("research", item.id)
                }}
                className={route.threadId === item.id ? "active" : ""}
              >
                <MessageSquare size={13} />
                <span>{item.title}</span>
                {running?.threadId === item.id && (
                  <span className="recent-running" />
                )}
              </a>
            ))
          ) : (
            <div className="recent-empty">
              <MessageSquare size={15} />
              <p>
                A place for your next
                <br />
                good question.
              </p>
            </div>
          )}
        </div>
        <div className="sidebar-bottom">
          <div
            className={`ai-connection-card ${state.access?.connected ? "is-connected" : ""}`}
          >
            <div className="ai-connection-icon">
              <Cpu size={18} />
              <span />
            </div>
            <h3>
              {state.access?.connected
                ? "Your agent is ready"
                : "Your research, your way"}
            </h3>
            <p>
              {state.access?.connected
                ? `${state.access.model} / ${state.access.mode === "local" ? "Local connection" : `${(state.access.budget - state.access.spent).toFixed(2)} USDC available`}`
                : "Bring your AI subscription or pay as you go."}
            </p>
            <button
              onClick={() =>
                state.access?.connected ? go("access") : setAccessOpen(true)
              }
            >
              {state.access?.connected
                ? "Manage AI access"
                : "Set up AI access"}
              <ArrowUpRight size={14} />
            </button>
            <span className="connection-demo">
              {state.access?.connected
                ? "Simulated connection"
                : "No subscription? No problem."}
            </span>
          </div>
          <a
            className={`sharing-link ${page === "sharing" ? "active" : ""}`}
            href="#/sharing"
            onClick={(event) => {
              event.preventDefault()
              go("sharing")
            }}
          >
            <Network size={15} />
            Shared capacity<span>CONCEPT</span>
          </a>
          <div className="sidebar-user">
            <span className="workspace-avatar">CB</span>
            <div>
              <strong>Personal workspace</strong>
              <span>Demo environment</span>
            </div>
            <button
              className="sidebar-icon"
              aria-label="Workspace settings"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings2 size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell" inert={mobileNav || undefined}>
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              aria-expanded={mobileNav}
              onClick={() => setMobileNav(!mobileNav)}
            >
              <Menu size={20} />
            </button>
            <span className="topbar-page">{pageNames[page]}</span>
            <span className="topbar-slash">/</span>
            <span className="topbar-description">Your DeFi research desk</span>
          </div>
          <div className="topbar-right">
            <button
              className="search-shortcut"
              aria-label="Search workspace"
              onClick={() => setCommandOpen(true)}
            >
              <Search size={15} />
              <span>Search anything</span>
              <kbd>
                <Command size={10} />K
              </kbd>
            </button>
            <button
              className="icon-button theme-toggle"
              aria-label={
                theme === "dark"
                  ? "Switch to light theme"
                  : "Switch to dark theme"
              }
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <div className="notification-container">
              <button
                className="icon-button"
                aria-label="Show notifications"
                aria-expanded={notifications}
                onClick={() => setNotifications(!notifications)}
              >
                <Bell size={17} />
                {state.activity.length > 0 && (
                  <span className="notification-dot" />
                )}
              </button>
              {notifications && (
                <div className="notification-popover">
                  <h3>Workspace updates</h3>
                  {state.activity.length ? (
                    state.activity.slice(0, 3).map((item) => (
                      <button key={item.id} onClick={() => go("activity")}>
                        <Check size={15} />
                        <span>
                          <strong>
                            {item.type === "Research"
                              ? "Research complete"
                              : `${item.type} confirmed`}
                          </strong>
                          <span>{item.title}</span>
                        </span>
                      </button>
                    ))
                  ) : (
                    <p>
                      You're all caught up. Research and demo transaction
                      updates will appear here.
                    </p>
                  )}
                  <button
                    className="text-button"
                    onClick={() => setNotifications(false)}
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </div>
            <span className="topbar-divider" />
            <button
              className={`wallet-button ${state.wallet ? "connected" : ""}`}
              onClick={() =>
                state.wallet ? setWalletDetails(true) : setWalletOpen(true)
              }
            >
              <Wallet size={15} />
              <span>{state.wallet ? "0xD3A0...C001" : "Connect wallet"}</span>
              {state.wallet && <ChevronDown size={13} />}
            </button>
          </div>
        </header>
        <main
          ref={contentRef}
          className="main-content"
          id="main-content"
          tabIndex={-1}
        >
          {(page === "discover" || page === "saved") && (
            <Discover
              key={page}
              draft={draft}
              onDraftChange={setDraft}
              onSend={sendResearch}
              onAccess={() => setAccessOpen(true)}
              includeContext={includeContext}
              onContextChange={setIncludeContext}
              onInspect={setSelectedMarket}
              onPrompt={fillPrompt}
              savedOnly={page === "saved"}
            />
          )}
          {page === "research" && (
            <Research
              thread={thread}
              draft={draft}
              onDraftChange={setDraft}
              onSend={sendResearch}
              onAccess={() => setAccessOpen(true)}
              onStop={() => {
                setRunning(null)
                toast("Research stopped. No request charge was settled.")
              }}
              onNew={newResearch}
              includeContext={includeContext}
              onContextChange={setIncludeContext}
              busy={!!running}
              stage={stage}
              runningId={running?.messageId}
              onInspect={setSelectedMarket}
              onAction={act}
              onPrompt={fillPrompt}
            />
          )}
          {page === "portfolio" && (
            <PortfolioPage
              onConnectWallet={() => setWalletOpen(true)}
              onAction={act}
              onResearch={(prompt, context) => {
                go("research")
                fillPrompt(prompt, context)
              }}
            />
          )}
          {page === "access" && (
            <AccessPage onSetup={() => setAccessOpen(true)} />
          )}
          {page === "sharing" && <SharingPage />}
          {page === "activity" && <ActivityPage />}
        </main>
        <footer className="app-footer">
          <span>
            <span className="footer-status" />
            Demo workspace
            <span className="footer-dot" />
            Sample data. No real transactions.
          </span>
          <button onClick={() => setHelpOpen(true)}>
            <CircleHelp size={13} />A little guidance
          </button>
        </footer>
      </div>
      {notice && (
        <div className="toast" key={notice.id} role="status">
          <span>
            <Check size={15} />
          </span>
          {notice.text}
        </div>
      )}
      {accessOpen && (
        <AccessModal
          onClose={() => {
            setAccessOpen(false)
            setPendingResearch(false)
          }}
          onReady={() => {
            setAccessOpen(false)
            if (pendingResearch) {
              setPendingResearch(false)
              sendResearch()
            }
          }}
        />
      )}
      {walletOpen && (
        <WalletModal
          onClose={() => {
            setWalletOpen(false)
            setPendingTransaction(null)
          }}
          onConnected={() => {
            setWalletOpen(false)
            if (pendingTransaction) {
              setTransaction(pendingTransaction)
              setPendingTransaction(null)
            }
          }}
        />
      )}
      {transaction && (
        <TransactionModal
          {...transaction}
          onClose={() => setTransaction(null)}
          onComplete={() => {
            setTransaction(null)
            go("portfolio")
          }}
        />
      )}
      {selectedMarket && (
        <MarketDetail
          market={selectedMarket}
          onClose={() => setSelectedMarket(null)}
          onAction={act}
          onResearch={(prompt) => {
            setSelectedMarket(null)
            fillPrompt(prompt)
          }}
        />
      )}
      {walletDetails && (
        <Modal
          title="Your demo wallet"
          eyebrow="Wallet connection"
          onClose={() => setWalletDetails(false)}
        >
          <div className="simple-modal-content">
            <SampleBadge label="Simulated wallet" />
            <div className="connected-wallet-summary">
              <span className="wallet-summary-icon">
                <Wallet size={26} />
              </span>
              <h3>{state.wallet?.name}</h3>
              <code>0xD3A0...C001</code>
              {state.wallet && <ChainBadge chain={state.wallet.chain} />}
            </div>
            <div className="callout">
              <ShieldCheck size={18} />
              <p>
                Your real wallet is not connected. No keys, credentials, or
                funds are accessed. Portfolio context needs separate permission.
              </p>
            </div>
            <button
              className="btn btn-secondary full-width"
              onClick={() => {
                disconnectWallet()
                setWalletDetails(false)
              }}
            >
              Disconnect demo wallet
            </button>
          </div>
        </Modal>
      )}
      {commandOpen && (
        <Modal
          title="Find your next move"
          eyebrow="Quick search"
          onClose={() => {
            setCommandOpen(false)
            setCommandSearch("")
          }}
        >
          <div className="command-content">
            <label className="command-input">
              <Search size={19} />
              <input
                autoFocus
                value={commandSearch}
                onChange={(event) => setCommandSearch(event.target.value)}
                placeholder="Search pages, markets, or start a question"
                aria-label="Search pages and markets"
              />
            </label>
            <div className="command-results">
              {Object.entries(pageNames)
                .filter(([, label]) =>
                  label.toLowerCase().includes(commandSearch.toLowerCase())
                )
                .map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => {
                      go(id as Page)
                      setCommandOpen(false)
                      setCommandSearch("")
                    }}
                  >
                    <Compass size={16} />
                    <span>{label}</span>
                    <ArrowRight size={14} />
                  </button>
                ))}
              {commandSearch &&
                markets
                  .filter((market) =>
                    `${market.protocol} ${market.asset} ${market.chain}`
                      .toLowerCase()
                      .includes(commandSearch.toLowerCase())
                  )
                  .slice(0, 4)
                  .map((market) => (
                    <button
                      key={market.id}
                      onClick={() => {
                        setCommandOpen(false)
                        setSelectedMarket(market)
                      }}
                    >
                      <Search size={16} />
                      <span>
                        {market.protocol} / {market.asset} / {market.chain}
                      </span>
                      <ArrowRight size={14} />
                    </button>
                  ))}
              {commandSearch && (
                <button
                  className="command-ask"
                  onClick={() => {
                    go("research")
                    setDraft(commandSearch)
                    setCommandOpen(false)
                    setCommandSearch("")
                  }}
                >
                  <Sparkles size={16} />
                  <span>Ask the agent about "{commandSearch}"</span>
                  <ArrowRight size={14} />
                </button>
              )}
            </div>
            <p className="small muted">
              Selecting a question fills the composer. It does not send it.
            </p>
          </div>
        </Modal>
      )}
      {settingsOpen && (
        <Modal
          title="Make yourself at home"
          eyebrow="Workspace settings"
          onClose={() => {
            setSettingsOpen(false)
            setConfirmClear(false)
          }}
        >
          <div className="simple-modal-content">
            <div className="settings-row">
              <div>
                <h3>Appearance</h3>
                <p>Choose the light that works for you.</p>
              </div>
              <select
                className="field"
                aria-label="Appearance"
                value={theme}
                onChange={(event) =>
                  setTheme(event.target.value as "light" | "dark" | "system")
                }
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="system">System</option>
              </select>
            </div>
            <div className="settings-row">
              <div>
                <h3>Your workspace is local</h3>
                <p>
                  Chats, saved markets, and tracked positions stay in this
                  browser. Clearing browser data removes them.
                </p>
              </div>
            </div>
            <div className="callout">
              <ShieldCheck size={18} />
              <p>
                This app never collects wallet secrets or AI credentials. All
                connections are simulated.
              </p>
            </div>
            {confirmClear ? (
              <div className="clear-confirmation">
                <h3>Clear your research history and saved markets?</h3>
                <p>
                  This only removes chats and bookmarks. Your demo wallet,
                  tracked positions, and activity will remain.
                </p>
                <div className="row">
                  <button
                    className="btn btn-secondary"
                    onClick={() => setConfirmClear(false)}
                  >
                    Keep my research
                  </button>
                  <button
                    className="btn btn-danger"
                    onClick={() => {
                      if (running) {
                        toast(
                          "Stop the running research before clearing history."
                        )
                        return
                      }
                      setState((current) => ({
                        ...current,
                        threads: [],
                        saved: [],
                      }))
                      setConfirmClear(false)
                      go("discover")
                      toast("Research history and saved markets cleared")
                    }}
                  >
                    Clear research
                  </button>
                </div>
              </div>
            ) : (
              <button
                className="btn btn-secondary"
                onClick={() => setConfirmClear(true)}
              >
                Clear research and bookmarks
              </button>
            )}
          </div>
        </Modal>
      )}
      {clarifyOpen && (
        <Modal
          title="What would you like to compare?"
          eyebrow="A little context first"
          onClose={() => setClarifyOpen(false)}
        >
          <div className="simple-modal-content">
            <p className="muted">
              A meaningful comparison needs an asset and a time window. Choose a
              starting point, then review your updated question before sending.
            </p>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setDraft(
                  `${draft.trim()} Focus on USDC supply on Ethereum, Base, and Arbitrum over the last seven days.`
                )
                setClarifyOpen(false)
                requestAnimationFrame(() =>
                  document.getElementById("research-question")?.focus()
                )
              }}
            >
              USDC lending across three networks
              <ArrowRight size={16} />
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setDraft(
                  `${draft.trim()} Compare Uniswap V3 ETH / USDC pool fees over the last three days on Ethereum and Base.`
                )
                setClarifyOpen(false)
                requestAnimationFrame(() =>
                  document.getElementById("research-question")?.focus()
                )
              }}
            >
              ETH / USDC liquidity pool fees
              <ArrowRight size={16} />
            </button>
            <p className="small muted">
              No research has run and no budget has been used.
            </p>
          </div>
        </Modal>
      )}
      {helpOpen && (
        <Modal
          title="From a question to a next step"
          eyebrow="A quick guide"
          onClose={() => setHelpOpen(false)}
        >
          <div className="simple-modal-content guide-content">
            <SampleBadge label="Interactive demo" />
            <ol>
              <li>
                <strong>Start with a question</strong>
                <p>
                  Choose a starter in Discover or write your own. You can edit
                  every starter before sending.
                </p>
              </li>
              <li>
                <strong>Choose your AI access</strong>
                <p>
                  Simulate a local connection or approve a capped budget for the
                  demo service.
                </p>
              </li>
              <li>
                <strong>Follow the evidence</strong>
                <p>
                  Open source references, inspect the comparison method, and
                  consider the risks.
                </p>
              </li>
              <li>
                <strong>Make your own call</strong>
                <p>
                  Connect a demo wallet and review a supply or swap. Each
                  transaction needs your confirmation.
                </p>
              </li>
              <li>
                <strong>Keep the context</strong>
                <p>
                  Your confirmed supplies appear in Portfolio. Attach positions
                  explicitly to follow-up questions.
                </p>
              </li>
            </ol>
            <button
              className="btn btn-primary full-width"
              onClick={() => {
                setHelpOpen(false)
                go("discover")
                setDraft(starters[0].text)
              }}
            >
              Try the full journey
              <ArrowRight size={16} />
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
export function CoolBarDesk() {
  return (
    <WorkspaceProvider>
      <WorkspaceApp />
    </WorkspaceProvider>
  )
}
export default CoolBarDesk
