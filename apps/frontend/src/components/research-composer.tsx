import {
  ArrowUp,
  Check,
  ChevronDown,
  Cpu,
  Database,
  Paperclip,
  ShieldCheck,
  Square,
  Wallet,
} from "lucide-react"
import { useState } from "react"
import { useWorkspace } from "@/lib/workspace"

type Props = {
  draft: string
  onDraftChange: (draft: string) => void
  onSend: () => void
  onAccess: () => void
  includeContext: boolean
  onContextChange: (include: boolean) => void
  busy?: boolean
  onStop?: () => void
  compact?: boolean
}
export function ResearchComposer({
  draft,
  onDraftChange,
  onSend,
  onAccess,
  includeContext,
  onContextChange,
  busy,
  onStop,
  compact,
}: Props) {
  const { state, setState } = useWorkspace()
  const [contextOpen, setContextOpen] = useState(false)
  return (
    <div className={`composer-wrap ${compact ? "compact" : ""}`}>
      <div className="research-composer">
        <label className="sr-only" htmlFor="research-question">
          Your research question
        </label>
        <textarea
          id="research-question"
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault()
              if (draft.trim() && !busy) onSend()
            }
          }}
          placeholder={
            compact
              ? "Ask a follow-up question..."
              : "Where should I put my USDC to work?"
          }
          rows={compact ? 2 : 3}
          maxLength={2000}
        />
        <div className="composer-controls">
          <div className="composer-tools">
            {state.access?.connected ? (
              <label className="model-picker">
                <Cpu size={14} />
                <span className="sr-only">Research model</span>
                <select
                  value={state.access.model}
                  disabled={busy}
                  onChange={(event) => {
                    const model = event.target.value
                    setState((current) => ({
                      ...current,
                      access: current.access
                        ? { ...current.access, model }
                        : null,
                    }))
                  }}
                >
                  {[
                    ...new Set([
                      state.access.model,
                      ...(state.access.provider === "Codex"
                        ? ["Codex default"]
                        : ["Claude Opus", "Claude Sonnet"]),
                    ]),
                  ].map((model) => (
                    <option key={model}>{model}</option>
                  ))}
                </select>
                <ChevronDown size={12} />
              </label>
            ) : (
              <button className="composer-tool" onClick={onAccess}>
                <Cpu size={14} />
                Choose AI access
                <ChevronDown size={12} />
              </button>
            )}
            <span className="tool-divider" />
            <div className="context-tool">
              <button
                className={`composer-tool ${includeContext ? "selected" : ""}`}
                aria-expanded={contextOpen}
                onClick={() => setContextOpen(!contextOpen)}
              >
                <Paperclip size={14} />
                <span>
                  {includeContext
                    ? `${state.positions.length} position${state.positions.length === 1 ? "" : "s"} attached`
                    : "Add context"}
                </span>
                {includeContext && <Check size={12} />}
              </button>
              {contextOpen && (
                <div className="context-popover">
                  <div className="row">
                    <Wallet size={17} />
                    <strong>Your portfolio stays private</strong>
                  </div>
                  <p>
                    Include tracked positions in this request only. Connecting a
                    wallet never shares them automatically.
                  </p>
                  {state.positions.length ? (
                    <button
                      className="btn btn-secondary"
                      onClick={() => {
                        onContextChange(!includeContext)
                        setContextOpen(false)
                      }}
                    >
                      {includeContext
                        ? "Remove portfolio context"
                        : `Attach ${state.positions.length} tracked position${state.positions.length === 1 ? "" : "s"}`}
                    </button>
                  ) : (
                    <span className="small muted">
                      No tracked positions yet. Complete a demo supply to add
                      one.
                    </span>
                  )}
                  <button
                    className="text-button context-dismiss"
                    onClick={() => setContextOpen(false)}
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          </div>
          <button
            className={`send-button ${busy ? "stop" : ""}`}
            disabled={!busy && !draft.trim()}
            onClick={busy ? onStop : onSend}
            aria-label={busy ? "Stop research" : "Send research question"}
          >
            {busy ? (
              <Square size={16} fill="currentColor" />
            ) : (
              <ArrowUp size={20} />
            )}
          </button>
        </div>
      </div>
      <div className="composer-caption">
        <span>
          <Database size={12} />
          Public data. Clear sources.
        </span>
        <span>
          <ShieldCheck size={12} />
          Your wallet stays in your control.
        </span>
      </div>
    </div>
  )
}
