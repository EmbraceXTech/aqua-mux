"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  encodeFunctionData,
  erc20Abi,
  isAddress,
  parseUnits,
  toHex,
  type Address,
  type Hex,
} from "viem";
import type { Provider } from "@/lib/wallet";
import { saveSwapActivity } from "@/lib/swap-activity";
import { swapTransactionStatus } from "@/lib/swap-transaction-status";
import {
  buildSwap,
  getToken,
  isNative,
  routeLegs,
  SWAP_CHAIN,
  SWAP_DEADLINE_SECONDS,
  tokenUnits,
  V3_ROUTER,
  type LiveQuote,
  type SwapRequest,
  type Symbol,
} from "@/lib/live-swap";

type Holdings = Partial<
  Record<Symbol, { balance: string; allowance: string } | null>
>;
type QuoteRouteError = { index: number; message: string };
type ApiError = Error & { routeErrors?: QuoteRouteError[] };
const message = (e: unknown) => {
  if (e && typeof e === "object" && "code" in e && e.code === 4001)
    return "Request rejected in wallet. Nothing was submitted.";
  return e instanceof Error
    ? e.message.slice(0, 350)
    : "Wallet request failed.";
};
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || "Request failed.") as ApiError;
    if (Array.isArray(data.routeErrors)) error.routeErrors = data.routeErrors;
    throw error;
  }
  return data;
}
function provider(): Provider {
  if (!window.ethereum)
    throw new Error("Install or enable MetaMask, then reload this page.");
  return window.ethereum;
}
export function useLiveSwap(request: SwapRequest) {
  const key = JSON.stringify(request);
  const [account, setAccount] = useState<Address>();
  const [walletChain, setWalletChain] = useState<number>();
  const [holdings, setHoldings] = useState<Holdings>({});
  const [quote, setQuote] = useState<LiveQuote>();
  const [quoteError, setQuoteError] = useState("");
  const [routeErrors, setRouteErrors] = useState<Partial<Record<Symbol, string>>>(
    {},
  );
  const [error, setError] = useState("");
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [clock, setClock] = useState(0);
  const [pending, setPending] = useState<{
    hash: Hex;
    label: string;
    submittedAt: number;
  }>();
  const [unlocated, setUnlocated] = useState(false);
  const [awaitingWallet, setAwaitingWallet] = useState<{ deadline?: number }>();
  const [result, setResult] = useState<{
    hash: Hex;
    success: boolean;
    label: string;
    submittedAt: number;
  }>();
  const [unknown, setUnknown] = useState(false);
  useEffect(() => {
    if (!pending && !awaitingWallet && !unknown) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pending, awaitingWallet, unknown]);
  const sending = useRef(false);
  const current = useRef({ key, account, walletChain });
  useLayoutEffect(() => {
    current.current = { key, account, walletChain };
  }, [key, account, walletChain]);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    const p = window.ethereum;
    if (!p) return () => clearInterval(timer);
    let alive = true;
    const sync = () => {
      setHoldings({});
      Promise.all([
        p.request({ method: "eth_accounts" }),
        p.request({ method: "eth_chainId" }),
      ])
        .then(([accounts, chain]) => {
          if (!alive) return;
          const address = Array.isArray(accounts) ? accounts[0] : undefined;
          setAccount(
            typeof address === "string" && isAddress(address)
              ? address
              : undefined,
          );
          setWalletChain(Number(chain));
        })
        .catch(() => {
          if (alive) {
            setAccount(undefined);
            setWalletChain(undefined);
          }
        });
    };
    sync();
    p.on?.("accountsChanged", sync);
    p.on?.("chainChanged", sync);
    return () => {
      alive = false;
      clearInterval(timer);
      p.removeListener?.("accountsChanged", sync);
      p.removeListener?.("chainChanged", sync);
    };
  }, []);
  const selectedTokens = request.draft.input
    .concat(request.draft.output)
    .map((row) => row.symbol)
    .join(",");
  const refreshHoldings = useCallback(async () => {
    if (!account) return;
    const value = await api<Holdings>(
      `/api/live-swap?account=${account}&tokens=${encodeURIComponent(selectedTokens)}`,
    );
    if (current.current.account === account) setHoldings(value);
    return value;
  }, [account, selectedTokens]);
  useEffect(() => {
    let alive = true;
    if (!account) return;
    api<Holdings>(
      `/api/live-swap?account=${account}&tokens=${encodeURIComponent(selectedTokens)}`,
    )
      .then((value) => {
        if (alive) setHoldings(value);
      })
      .catch((e) => {
        if (alive) setError(message(e));
      });
    return () => {
      alive = false;
    };
  }, [account, revision, selectedTokens]);
  useEffect(() => {
    const controller = new AbortController();
    let alive = true;
    const timer = setTimeout(async () => {
      setQuote(undefined);
      setQuoteError("");
      setRouteErrors({});
      try {
        routeLegs(JSON.parse(key));
      } catch (e) {
        setQuoteError(
          e instanceof Error && e.name === "ZodError"
            ? "Check amounts, fee tiers, and slippage settings."
            : message(e),
        );
        setQuoteBusy(false);
        return;
      }
      setQuoteBusy(true);
      try {
        const value = await api<LiveQuote>("/api/live-swap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: key,
          signal: controller.signal,
        });
        if (alive) setQuote(value);
      } catch (e) {
        if (!alive) return;
        const errors = (e as ApiError).routeErrors;
        if (Array.isArray(errors)) {
          const quoteRequest = JSON.parse(key) as SwapRequest;
          const multi =
            quoteRequest.mode === "multi-in" ? "input" : "output";
          const next = errors.reduce<Partial<Record<Symbol, string>>>(
            (all, error) => {
              const row = quoteRequest.draft[multi][error.index];
              if (row && typeof error.message === "string")
                all[row.symbol] = error.message;
              return all;
            },
            {},
          );
          if (Object.keys(next).length) {
            setRouteErrors(next);
            return;
          }
        }
        setQuoteError(message(e));
      } finally {
        if (alive) setQuoteBusy(false);
      }
    }, 500);
    return () => {
      alive = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, revision]);
  useEffect(() => {
    if (!pending || walletChain !== SWAP_CHAIN) return;
    let alive = true;
    let polling = false;
    const poll = async () => {
      if (polling) return;
      polling = true;
      try {
        const p = provider();
        const receipt = (await p.request({
          method: "eth_getTransactionReceipt",
          params: [pending.hash],
        })) as { status: string } | null;
        const transaction = receipt
          ? null
          : await p.request({
              method: "eth_getTransactionByHash",
              params: [pending.hash],
            });
        const state = swapTransactionStatus(
          receipt,
          transaction,
          Date.now() - pending.submittedAt,
        );
        if (alive) {
          setUnlocated(state === "unlocated");
          if (state === "confirmed" || state === "reverted") {
            setResult({ ...pending, success: state === "confirmed" });
            setPending(undefined);
            setError("");
            setRevision((v) => v + 1);
          }
        }
      } catch {
        if (alive)
          setError(
            "Receipt unavailable. Keep this page open and check wallet activity. Do not resubmit.",
          );
      } finally {
        polling = false;
      }
    };
    void poll();
    const timer = setInterval(poll, 3000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [pending, walletChain]);
  useEffect(() => {
    if (!result) return;
    saveSwapActivity({
      hash: result.hash,
      label: result.label,
      submittedAt: result.submittedAt,
      state: result.success ? "confirmed" : "reverted",
    });
  }, [result]);
  const activeQuote =
    quote && JSON.stringify(quote.request) === key ? quote : undefined;
  const fresh = !!activeQuote && clock > 0 && activeQuote.expiresAt > clock;
  const insufficient =
    activeQuote && account
      ? request.draft.input.flatMap((r, i) => {
          const balance = holdings[r.symbol]?.balance;
          if (balance === undefined)
            return [`${r.symbol} balance unavailable.`];
          const required = tokenUnits(activeQuote.limits.input[i], r.symbol);
          // Balance may be zero; unlike trade amounts it is allowed here.
          const actual = parseUnits(balance, getToken(r.symbol).decimals);
          return required > actual
            ? [`Not enough ${r.symbol}, including slippage.`]
            : [];
        })
      : [];
  const approvalsFor = (q?: LiveQuote) =>
    q
      ? q.request.draft.input.flatMap((r, i) => {
          if (isNative(r.symbol)) return [];
          const cap = tokenUnits(q.limits.input[i], r.symbol);
          const allowance = holdings[r.symbol]?.allowance;
          return allowance !== undefined && BigInt(allowance) < cap
            ? [
                {
                  symbol: r.symbol,
                  label: getToken(r.symbol).symbol,
                  cap,
                  reset: BigInt(allowance) > 0n,
                },
              ]
            : [];
        })
      : [];
  async function connect() {
    setBusy(true);
    setError("");
    try {
      const p = provider();
      const addresses = (await p.request({
        method: "eth_requestAccounts",
      })) as Address[];
      setAccount(addresses[0]);
      setWalletChain(Number(await p.request({ method: "eth_chainId" })));
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function switchChain() {
    setBusy(true);
    setError("");
    try {
      await provider().request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: toHex(SWAP_CHAIN) }],
      });
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function send(
    reviewed: LiveQuote,
    approval?: ReturnType<typeof approvalsFor>[number],
  ) {
    if (sending.current || pending || unknown) return;
    sending.current = true;
    setBusy(true);
    setError("");
    setResult(undefined);
    let requested = false;
    try {
      const p = provider();
      const owner = account;
      const check = async () => {
        const [accounts, chain] = await Promise.all([
          p.request({ method: "eth_accounts" }),
          p.request({ method: "eth_chainId" }),
        ]);
        if (
          !owner ||
          (accounts as string[])[0]?.toLowerCase() !== owner.toLowerCase() ||
          Number(chain) !== SWAP_CHAIN
        )
          throw new Error(
            "Wallet account or network changed. Reconnect on Arbitrum and review again.",
          );
        if (
          current.current.key !== JSON.stringify(reviewed.request) ||
          reviewed.expiresAt <= Date.now()
        )
          throw new Error(
            "Quote changed or expired. Refresh and review again.",
          );
      };
      await check();
      const balances = await refreshHoldings();
      if (!balances) throw new Error("Balances unavailable.");
      for (const [i, r] of reviewed.request.draft.input.entries()) {
        const held = balances[r.symbol];
        if (!held) throw new Error(`${r.symbol} balance unavailable.`);
        if (
          parseUnits(held.balance, getToken(r.symbol).decimals) <
          tokenUnits(reviewed.limits.input[i], r.symbol)
        )
          throw new Error(`Not enough ${r.symbol}.`);
        if (
          !approval &&
          !isNative(r.symbol) &&
          BigInt(held.allowance) <
            tokenUnits(reviewed.limits.input[i], r.symbol)
        )
          throw new Error(`Approve ${r.symbol} first.`);
      }
      if (approval) {
        const index = reviewed.request.draft.input.findIndex(
          (r) => r.symbol === approval.symbol,
        );
        if (
          index < 0 ||
          approval.cap !==
            tokenUnits(reviewed.limits.input[index], approval.symbol)
        )
          throw new Error("Approval does not match the reviewed limit.");
      }
      const transactionTime = Date.now();
      const tx = approval
        ? {
            to: getToken(approval.symbol).address,
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: "approve",
              args: [V3_ROUTER, approval.reset ? 0n : approval.cap],
            }),
            value: 0n,
          }
        : buildSwap(reviewed, owner!, transactionTime);
      const rpcTx = {
        from: owner,
        to: tx.to,
        data: tx.data,
        value: toHex(tx.value),
      };
      // Wallet RPC simulation includes live balances, allowances, pool state, and gas.
      await p.request({ method: "eth_call", params: [rpcTx, "latest"] });
      await p.request({ method: "eth_estimateGas", params: [rpcTx] });
      await check();
      setAwaitingWallet({
        deadline: approval
          ? undefined
          : transactionTime + SWAP_DEADLINE_SECONDS * 1000,
      });
      requested = true;
      const hash = await p.request({
        method: "eth_sendTransaction",
        params: [rpcTx],
      });
      if (typeof hash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(hash))
        throw new Error(
          "Wallet returned no transaction hash. Check activity before retrying.",
        );
      setUnlocated(false);
      const submittedAt = Date.now();
      const label = approval
        ? `${approval.reset ? "Reset" : "Approve"} ${approval.label}`
        : "Swap";
      setPending({ hash: hash as Hex, submittedAt, label });
      saveSwapActivity({
        hash: hash as Hex,
        label,
        submittedAt,
        state: "pending",
      });
      return true;
    } catch (e) {
      if (
        requested &&
        !(e && typeof e === "object" && "code" in e && e.code === 4001)
      )
        setUnknown(true);
      setError(message(e));
    } finally {
      sending.current = false;
      setAwaitingWallet(undefined);
      setBusy(false);
    }
  }
  return {
    account,
    walletChain,
    holdings,
    quote: activeQuote,
    fresh,
    quoteBusy,
    quoteError,
    routeErrors,
    error,
    busy,
    pending,
    unlocated,
    awaitingWallet,
    result,
    unknown,
    insufficient: insufficient ?? [],
    approvalsFor,
    connect,
    switchChain,
    send,
    refresh: () => setRevision((v) => v + 1),
    clock,
  };
}
