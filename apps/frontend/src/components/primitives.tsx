import { useEffect, useId, useRef } from "react"
import type { ReactNode } from "react"
import { ArrowUpRight, Check, CircleHelp, X } from "lucide-react"
import type { Chain } from "@/lib/demo-data"

export function BrandMark({ small = false }: { small?: boolean }) {
  return (
    <span className={`brand-mark ${small ? "small" : ""}`} aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  )
}
export function TokenIcon({
  asset,
  small = false,
}: {
  asset: string
  small?: boolean
}) {
  if (asset.includes("/"))
    return (
      <span className="token-pair">
        <TokenIcon asset="ETH" small={small} />
        <TokenIcon
          asset={asset.includes("USDT") ? "USDT" : "USDC"}
          small={small}
        />
      </span>
    )
  return (
    <span
      className={`token-icon token-${asset.toLowerCase()} ${small ? "small" : ""}`}
      aria-hidden="true"
    >
      {asset === "ETH" ? (
        <svg viewBox="0 0 24 24">
          <path
            d="m12 2 6 10-6 3-6-3 6-10Zm0 15 6-3-6 8-6-8 6 3Z"
            fill="currentColor"
          />
        </svg>
      ) : asset === "USDT" ? (
        "T"
      ) : (
        "$"
      )}
    </span>
  )
}
export function ProtocolIcon({
  protocol,
  small = false,
}: {
  protocol: string
  small?: boolean
}) {
  return (
    <span
      className={`protocol-icon protocol-${protocol.split(" ")[0].toLowerCase()} ${small ? "small" : ""}`}
      aria-hidden="true"
    >
      {protocol.startsWith("Aave") ? (
        <svg viewBox="0 0 24 24">
          <path
            d="M5 16V11a7 7 0 0 1 14 0v5l-2-1-2 2-3-2-3 2-2-2-2 1Z"
            fill="currentColor"
          />
          <circle cx="9" cy="10" r="1" fill="var(--card)" />
          <circle cx="15" cy="10" r="1" fill="var(--card)" />
        </svg>
      ) : protocol === "Morpho" ? (
        "M"
      ) : protocol.startsWith("Uniswap") ? (
        "U"
      ) : (
        "C"
      )}
    </span>
  )
}
export function ChainIcon({ chain }: { chain: Chain }) {
  return (
    <span
      className={`chain-icon chain-${chain.toLowerCase()}`}
      aria-hidden="true"
    >
      {chain === "Ethereum" ? (
        <svg viewBox="0 0 16 16">
          <path
            d="m8 1 4 7-4 2-4-2 4-7Zm0 10 4-2-4 6-4-6 4 2Z"
            fill="currentColor"
          />
        </svg>
      ) : chain === "Base" ? (
        <span />
      ) : (
        <svg viewBox="0 0 16 16">
          <path
            d="m3 11 4-8h3l-4 8H3Zm5 2 4-8 2 4-2 4H8Z"
            fill="currentColor"
          />
        </svg>
      )}
    </span>
  )
}
export function ChainBadge({ chain }: { chain: Chain }) {
  return (
    <span className="chain-badge">
      <ChainIcon chain={chain} />
      {chain}
    </span>
  )
}
export function SampleBadge({ label = "Sample data" }: { label?: string }) {
  return (
    <span className="sample-badge">
      <span />
      {label}
    </span>
  )
}
export function EmptyState({
  icon,
  title,
  text,
  action,
}: {
  icon?: ReactNode
  title: string
  text: string
  action?: ReactNode
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">{icon ?? <CircleHelp size={26} />}</span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  )
}
export function ExternalLink({
  href,
  children,
}: {
  href: string
  children: ReactNode
}) {
  return (
    <a className="external-link" href={href} target="_blank" rel="noreferrer">
      {children}
      <ArrowUpRight size={14} />
    </a>
  )
}
export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      className={`toggle ${checked ? "on" : ""}`}
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      disabled={disabled}
    >
      <span>{checked && <Check size={11} />}</span>
    </button>
  )
}
export function Modal({
  title,
  eyebrow,
  children,
  onClose,
  wide = false,
  busy = false,
}: {
  title: string
  eyebrow?: string
  children: ReactNode
  onClose: () => void
  wide?: boolean
  busy?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const headingId = useId()
  useEffect(() => {
    const node = ref.current
    const previous = document.activeElement as HTMLElement | null
    node?.showModal()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      node?.close()
      document.body.style.overflow = previousOverflow
      previous?.focus()
    }
  }, [])
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide" : ""}`}
      aria-labelledby={headingId}
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) {
          const rect = ref.current!.getBoundingClientRect()
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            onClose()
        }
      }}
    >
      <div className="modal-heading">
        <div>
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          <h2 id={headingId}>{title}</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Close dialog"
          disabled={busy}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  )
}
