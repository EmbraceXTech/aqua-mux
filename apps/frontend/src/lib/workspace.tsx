/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react"
import type { Dispatch, ReactNode, SetStateAction } from "react"
import type { Chain, Market } from "./demo-data"

export type Page =
  | "discover"
  | "research"
  | "portfolio"
  | "access"
  | "sharing"
  | "saved"
  | "activity"
export type Access = {
  mode: "local" | "paid"
  provider: string
  model: string
  budget: number
  spent: number
  connected: boolean
}
export type Wallet = {
  name: string
  address: string
  chain: Chain
  balanceUSDC: number
  balanceETH: number
  balanceUSDT: number
}
export type Position = {
  id: string
  marketId: string
  amount: number
  openedAt: string
  tx: string
  status: "Active"
  wallet: string
}
export type Activity = {
  id: string
  type: "Supply" | "Withdraw" | "Swap" | "Research"
  title: string
  amount: number
  asset: string
  chain: Chain
  time: string
  tx: string
}
export type ResearchMessage = {
  id: string
  prompt: string
  kind: "lending" | "pool" | "portfolio" | "swap" | "unsupported"
  marketIds: string[]
  context: boolean
  positions?: Position[]
  complete: boolean
  cost: number
  model: string
}
export type Thread = {
  id: string
  title: string
  messages: ResearchMessage[]
  createdAt: string
}
export type WorkspaceState = {
  wallet: Wallet | null
  portfolioAllowed: boolean
  access: Access | null
  positions: Position[]
  activity: Activity[]
  saved: string[]
  threads: Thread[]
  sharing: {
    enabled: boolean
    dailyLimit: number
    requests: number
    earned: number
  }
}

const STORAGE_KEY = "coolbar-workspace-v1"
const initialState: WorkspaceState = {
  wallet: null,
  portfolioAllowed: false,
  access: null,
  positions: [],
  activity: [],
  saved: [],
  threads: [],
  sharing: { enabled: false, dailyLimit: 40, requests: 0, earned: 0 },
}
function loadState(): WorkspaceState {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null")
    if (
      value &&
      Array.isArray(value.positions) &&
      Array.isArray(value.threads) &&
      Array.isArray(value.saved) &&
      Array.isArray(value.activity)
    ) {
      return { ...initialState, ...value }
    }
  } catch {
    /* A private browser session still gets a working workspace. */
  }
  return initialState
}

type WorkspaceContext = {
  state: WorkspaceState
  setState: Dispatch<SetStateAction<WorkspaceState>>
  toast: (message: string) => void
  notice: { id: number; text: string } | null
  connectWallet: (name: string) => void
  disconnectWallet: () => void
  setWalletChain: (chain: Chain) => void
  setAccess: (access: Access | null) => void
  toggleSaved: (id: string) => void
  addPosition: (market: Market, amount: number) => void
  withdrawPosition: (positionId: string, amount: number) => void
}
const Workspace = createContext<WorkspaceContext | null>(null)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(loadState)
  const [notice, setNotice] = useState<WorkspaceContext["notice"]>(null)
  const toast = useCallback(
    (text: string) => setNotice({ id: Date.now(), text }),
    []
  )
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      /* State remains available in memory. */
    }
  }, [state])
  useEffect(() => {
    if (!notice) return
    const timeout = window.setTimeout(() => setNotice(null), 4500)
    return () => window.clearTimeout(timeout)
  }, [notice])
  const connectWallet = (name: string) => {
    setState((current) => ({
      ...current,
      portfolioAllowed: false,
      wallet: {
        name,
        address: "0xD3A000000000000000000000000000000000C001",
        chain: "Base",
        balanceUSDC: 12500,
        balanceETH: 1.25,
        balanceUSDT: 5000,
      },
    }))
    toast("Demo wallet connected. Portfolio access stays private.")
  }
  const disconnectWallet = () => {
    setState((current) => ({
      ...current,
      wallet: null,
      portfolioAllowed: false,
    }))
    toast("Wallet disconnected. Your local tracking is preserved.")
  }
  const setWalletChain = (chain: Chain) =>
    setState((current) => ({
      ...current,
      wallet: current.wallet ? { ...current.wallet, chain } : null,
    }))
  const setAccess = (access: Access | null) =>
    setState((current) => ({ ...current, access }))
  const toggleSaved = (id: string) =>
    setState((current) => ({
      ...current,
      saved: current.saved.includes(id)
        ? current.saved.filter((item) => item !== id)
        : [...current.saved, id],
    }))
  const addPosition = (market: Market, amount: number) => {
    setState((current) => {
      if (!current.wallet) return current
      const balanceKey = market.asset === "USDT" ? "balanceUSDT" : "balanceUSDC"
      if (
        !Number.isFinite(amount) ||
        amount <= 0 ||
        amount > current.wallet[balanceKey]
      )
        return current
      const id = crypto.randomUUID()
      const time = new Date().toISOString()
      const tx = `demo-${id.slice(0, 8)}`
      return {
        ...current,
        wallet: {
          ...current.wallet,
          [balanceKey]: current.wallet[balanceKey] - amount,
        },
        positions: [
          ...current.positions,
          {
            id,
            marketId: market.id,
            amount,
            openedAt: time,
            tx,
            status: "Active",
            wallet: current.wallet.address,
          },
        ],
        activity: [
          {
            id,
            type: "Supply",
            title: `Supply to ${market.protocol}`,
            amount,
            asset: market.asset,
            chain: market.chain,
            time,
            tx,
          },
          ...current.activity,
        ],
      }
    })
  }
  const withdrawPosition = (positionId: string, amount: number) =>
    setState((current) => {
      const position = current.positions.find((item) => item.id === positionId)
      if (
        !position ||
        !current.wallet ||
        !Number.isFinite(amount) ||
        amount <= 0 ||
        amount > position.amount
      )
        return current
      const isUSDT = position.marketId === "aave-usdt"
      const balanceKey = isUSDT ? "balanceUSDT" : "balanceUSDC"
      const id = crypto.randomUUID()
      return {
        ...current,
        wallet: {
          ...current.wallet,
          [balanceKey]: current.wallet[balanceKey] + amount,
        },
        positions: current.positions.flatMap((item) =>
          item.id !== positionId
            ? [item]
            : item.amount > amount
              ? [{ ...item, amount: item.amount - amount }]
              : []
        ),
        activity: [
          {
            id,
            type: "Withdraw",
            title: "Withdraw from Aave V3",
            amount,
            asset: isUSDT ? "USDT" : "USDC",
            chain: current.wallet.chain,
            time: new Date().toISOString(),
            tx: `demo-${id.slice(0, 8)}`,
          },
          ...current.activity,
        ],
      }
    })
  return (
    <Workspace.Provider
      value={{
        state,
        setState,
        toast,
        notice,
        connectWallet,
        disconnectWallet,
        setWalletChain,
        setAccess,
        toggleSaved,
        addPosition,
        withdrawPosition,
      }}
    >
      {children}
    </Workspace.Provider>
  )
}
export function useWorkspace() {
  const context = useContext(Workspace)
  if (!context)
    throw new Error("useWorkspace must be used in WorkspaceProvider")
  return context
}
