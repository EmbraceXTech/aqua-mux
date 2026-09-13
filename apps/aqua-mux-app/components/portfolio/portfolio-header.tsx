import Link from "next/link";
import { Wallet, Waves } from "lucide-react";
import { shortAddress } from "@/lib/utils/portfolio";
import type { PortfolioHeaderActionsProps } from "@/types/portfolio";
import s from "./portfolio.module.css";

export function PortfolioHeader({
  session,
  busy,
  localWalletAvailable,
  onConnect,
  onDisconnect,
}: PortfolioHeaderActionsProps) {
  return (
    <header className={s.header}>
      <Link href="/swap" className={s.brand}>
        <span className={s.brandMark}>
          <Waves size={22} />
        </span>
        Aqua<span>Mux</span>
      </Link>
      <nav aria-label="Main navigation">
        <Link href="/swap">Swap</Link>
        <Link href="/lp">Liquidity</Link>
        <Link href="/strategies">Strategies</Link>
        <Link href="/benchmark">Benchmark</Link>
        <Link href="/portfolio" aria-current="page" className={s.activeNav}>
          Portfolio
        </Link>
      </nav>
      <div className={s.walletActions}>
        {session ? (
          <>
            <span className={s.wallet} title={session.owner}>
              <span className={s.online} />
              {shortAddress(session.owner)}
            </span>
            <button
              className={s.secondary}
              disabled={busy}
              onClick={onDisconnect}
            >
              Disconnect
            </button>
          </>
        ) : (
          <>
            <button
              className={s.secondary}
              disabled={busy}
              onClick={() => onConnect("external")}
            >
              <Wallet size={15} />
              {busy ? "Waiting for wallet" : "Connect wallet"}
            </button>
            {localWalletAvailable && (
              <button
                className={s.secondary}
                disabled={busy}
                onClick={() => onConnect("local-development")}
              >
                Local wallet
              </button>
            )}
          </>
        )}
      </div>
    </header>
  );
}
