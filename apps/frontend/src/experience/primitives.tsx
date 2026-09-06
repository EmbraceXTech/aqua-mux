import { useEffect, useRef, type ReactNode } from "react"
import {
  Compass,
  MessageCircle,
  Wallet,
  Sparkles,
  Plus,
  ArrowRight,
  ArrowUp,
  ChevronRight,
  ChevronDown,
  X,
  Check,
  Globe,
  BookOpen,
  ExternalLink,
  Moon,
  Sun,
  Coins,
  ChartNoAxesCombined,
  SlidersHorizontal,
  ShieldCheck,
  Clock,
  Info,
  Link,
  RefreshCw,
  Menu,
  Terminal,
  Copy,
  TriangleAlert,
  Network,
  LogOut,
} from "lucide-react"
export function Icon({
  name,
  size = 20,
  className,
}: {
  name: string
  size?: number
  className?: string
}) {
  const icons = {
    compass: Compass,
    chat: MessageCircle,
    wallet: Wallet,
    spark: Sparkles,
    plus: Plus,
    arrow: ArrowRight,
    up: ArrowUp,
    chevron: ChevronRight,
    down: ChevronDown,
    close: X,
    check: Check,
    globe: Globe,
    book: BookOpen,
    external: ExternalLink,
    moon: Moon,
    sun: Sun,
    coins: Coins,
    chart: ChartNoAxesCombined,
    sliders: SlidersHorizontal,
    shield: ShieldCheck,
    clock: Clock,
    info: Info,
    link: Link,
    refresh: RefreshCw,
    menu: Menu,
    terminal: Terminal,
    copy: Copy,
    warning: TriangleAlert,
    network: Network,
    logout: LogOut,
  }
  const Element = icons[name as keyof typeof icons] || Sparkles
  return (
    <Element
      size={size}
      strokeWidth={1.65}
      className={className}
      aria-hidden="true"
    />
  )
}
export function Brand({ small = false }: { small?: boolean }) {
  return (
    <div className={`brand ${small ? "small" : ""}`}>
      <span className="brand-symbol">
        <i />
        <i />
        <i />
      </span>
      {!small && (
        <span>
          cool bar<span className="brand-dot">.</span>
        </span>
      )}
    </div>
  )
}
export function Token({
  asset,
  small = false,
}: {
  asset: string
  small?: boolean
}) {
  return (
    <span
      aria-hidden="true"
      className={`token token-${asset.toLowerCase()} ${small ? "small" : ""}`}
    >
      {asset === "USDC"
        ? "$"
        : asset === "USDT"
          ? "T"
          : asset === "DAI"
            ? "D"
            : "E"}
    </span>
  )
}
export function Chain({ name }: { name: string }) {
  return (
    <span className="chain">
      <span className={`chain-icon ${name.toLowerCase()}`}>
        {name === "Base" ? (
          ""
        ) : name === "Ethereum" ? (
          <svg viewBox="0 0 12 18">
            <path
              fill="currentColor"
              d="m6 0 6 9-6 4-6-4 6-9Zm0 14 6-4-6 8-6-8 6 4Z"
            />
          </svg>
        ) : (
          "A"
        )}
      </span>
      {name}
    </span>
  )
}
export function Sparkline({ values }: { values: number[] }) {
  const points = values
    .map((v, i) => `${(i * 81) / (values.length - 1)},${30 - (v - 3) * 10}`)
    .join(" ")
  return (
    <svg
      className="sparkline"
      viewBox="0 0 84 32"
      aria-label="Illustrative upward seven-day trend"
      role="img"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  )
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
  drawer = false,
  busy = false,
}: {
  title: string
  children: ReactNode
  onClose: () => void
  wide?: boolean
  drawer?: boolean
  busy?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = busy ? () => {} : onClose
  }, [onClose, busy])
  useEffect(() => {
    const previous = document.activeElement as HTMLElement
    const oldOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    ref.current?.focus()
    const listener = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current()
      if (event.key === "Tab") {
        const nodes = ref.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select, textarea, [tabindex="0"]'
        )
        if (!nodes?.length) return
        const first = nodes[0],
          last = nodes[nodes.length - 1]
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === ref.current)
        ) {
          event.preventDefault()
          last.focus()
        } else if (
          !event.shiftKey &&
          (document.activeElement === last ||
            document.activeElement === ref.current)
        ) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener("keydown", listener)
    return () => {
      document.body.style.overflow = oldOverflow
      document.removeEventListener("keydown", listener)
      previous?.focus()
    }
  }, [])
  return (
    <div
      className={`modal-backdrop ${drawer ? "drawer-backdrop" : ""}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose()
      }}
    >
      <div
        className={`modal ${wide ? "wide" : ""} ${drawer ? "drawer" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        ref={ref}
        tabIndex={-1}
      >
        <div className="modal-header">
          <h2 id="dialog-title">{title}</h2>
          <button
            className="icon-button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close dialog"
          >
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
