import { formatUnits } from "viem";
import type { TokenPairValidation } from "@/lib/token-registry";

export function RouteChecks({ checks }: { checks: TokenPairValidation[] }) {
  if (!checks.length) return null;
  return (
    <section className="managed-panel managed-stack">
      <h2>Metadata and funding route checks</h2>
      {checks.map((check) => (
        <div className="managed-pair" key={check.destination.address}>
          <h3>
            {check.source.symbol} to {check.destination.symbol}
          </h3>
          <p>
            Source metadata: {check.metadata.source.status}. Destination
            metadata: {check.metadata.destination.status}. Route:{" "}
            {check.route.status}.
          </p>
          <p>
            {check.route.amountOut
              ? `Quoted output ${formatUnits(BigInt(check.route.amountOut), check.destination.decimals)} ${check.destination.symbol}`
              : "No available route receipt."}
          </p>
          <p className="managed-footnote">
            Checked {new Date(check.route.checkedAt).toLocaleString()} for{" "}
            {formatUnits(BigInt(check.route.amountIn), check.source.decimals)}{" "}
            {check.source.symbol}. This probes the selected funding budget; the
            final plan must quote each allocated purchase and bind minimum
            receipts.
          </p>
          {[
            ...check.metadata.source.warnings,
            ...check.metadata.destination.warnings,
          ].map((warning, index) => (
            <p key={index}>{warning}</p>
          ))}
        </div>
      ))}
    </section>
  );
}
