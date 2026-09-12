import { ArrowUpRight } from "lucide-react";
import { NetworkIcon } from "@/components/managed/token-icon";
import type { TradeWorkspace } from "@/hooks/useTradeWorkspace";

export function SwapDetails({ trade }: { trade: TradeWorkspace }) {
  const { chainId, health, n, slippageBps } = trade;

  return (
    <section className="details-card">
      <h3>Transaction details</h3>
      <dl>
        <div>
          <dt>Network</dt>
          <dd>
            <NetworkIcon chainId={chainId} size={12} />
            {n.name}
          </dd>
        </div>
        <div>
          <dt>Execution</dt>
          <dd>
            1inch Swap
            <ArrowUpRight size={12} />
          </dd>
        </div>
        <div>
          <dt>Slippage tolerance</dt>
          <dd>{slippageBps / 100}%</dd>
        </div>
        <div>
          <dt>Network fee</dt>
          <dd>Calculated by wallet</dd>
        </div>
      </dl>
      {health && !health.swapApiConfigured && (
        <p className="api-note">
          Live quotes need a 1inch API key. Your basket is ready to configure.
        </p>
      )}
    </section>
  );
}
