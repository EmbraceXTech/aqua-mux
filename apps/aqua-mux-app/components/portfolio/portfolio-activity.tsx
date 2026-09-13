import { ArrowUpRight } from "lucide-react";
import { networks } from "@/lib/config";
import s from "./portfolio.module.css";

export function PortfolioActivity({ owner }: { owner: string }) {
  return (
    <div className={s.empty}>
      Transaction history is not available in AquaMux.
      <p className={s.activityNote}>
        View your wallet activity on a network explorer.
      </p>
      <div className={s.explorerLinks}>
        {networks.map((item) => (
          <a
            key={item.id}
            href={`${item.explorer}/address/${owner}`}
            target="_blank"
            rel="noreferrer"
          >
            {item.name} <ArrowUpRight size={13} />
          </a>
        ))}
      </div>
    </div>
  );
}
