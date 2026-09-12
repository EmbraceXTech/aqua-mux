import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { Layers3 } from "lucide-react";

type MainLayoutProps = {
  activePage: "swap" | "liquidity" | "strategies";
  actions?: ReactNode;
  children: ReactNode;
};

function Logo() {
  return (
    <Image
      className="brand-symbol"
      src="/aquamux-logo.svg"
      alt=""
      width={31}
      height={31}
      aria-hidden="true"
    />
  );
}

export function MainLayout({ activePage, actions, children }: MainLayoutProps) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/swap" aria-label="AquaMux home">
          <Logo />
          <span>
            Aqua<span className="brand-light">Mux</span>
          </span>
        </Link>
        <nav className="main-nav" aria-label="Main navigation">
          <Link className={activePage === "swap" ? "active" : ""} href="/swap">
            Swap
          </Link>
          <Link
            className={activePage === "liquidity" ? "active" : ""}
            href="/lp"
          >
            Liquidity
          </Link>
          <Link
            className={activePage === "strategies" ? "active" : ""}
            href="/strategies"
          >
            Strategies
          </Link>
        </nav>
        {actions && <div className="header-actions">{actions}</div>}
      </header>
      <main className="app-main">{children}</main>
      <footer className="app-footer">
        <span className="muted">© AquaMux 2026</span>
        <div className="bottom-note">
          <Layers3 size={13} /> Powered by{" "}
          <a
            href="https://1inch.com/aqua/overview"
            target="_blank"
            rel="noreferrer"
          >
            <strong>1inch Aqua</strong>
          </a>
        </div>
      </footer>
    </div>
  );
}
