import Link from "next/link";
import { ArrowRight, Waves } from "lucide-react";
import s from "./portfolio.module.css";

export function PortfolioFooter() {
  return (
    <>
      {" "}
      <p className={s.dataNote}>
        Supported token lists only. LP records include positions stored by
        AquaMux, not positions created elsewhere. N/A means the data service
        does not provide this metric. Exports include loaded balances and
        position records, not USD valuations.
      </p>
      <section className={s.cta}>
        <div className={s.ctaIcon}>
          <Waves size={27} />
        </div>
        <div>
          <h2>Put your portfolio to work.</h2>
          <p>
            Provide liquidity across multiple strategies, without splitting your
            capital.
          </p>
        </div>
        <Link href="/lp">
          Explore liquidity <ArrowRight size={16} />
        </Link>
      </section>
      <footer className={s.footer}>
        <span>
          © {new Date().getFullYear()} AquaMux{" "}
          <span className={s.footerSeparator}>/</span> Built on 1inch Aqua
        </span>
        <span>
          <span className={s.online} />
          Supported wallet balances · AquaMux LP records
        </span>
      </footer>
    </>
  );
}
