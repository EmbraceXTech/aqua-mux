import { formatUnits } from "viem";
import type { GroupDetail } from "@/lib/managed-client/api";

export function ObservationView({ detail }: { detail: GroupDetail }) {
  const observed = detail.observation;
  if (!observed)
    return (
      <div className="managed-notice">
        Current chain observations are unavailable. Use Reconcile and recover in
        Controls to read current backing and indexed history.
      </div>
    );
  const tokens = detail.group.config.pairs.flatMap((pair) => [
    pair.baseToken,
    pair.quoteToken,
  ]);
  const display = (address: string, value: string | null) => {
    if (value === null) return "Unavailable";
    const token = tokens.find((item) => item.address === address);
    return token
      ? `${formatUnits(BigInt(value), token.decimals)} ${token.symbol}`
      : `${value} raw units`;
  };
  return (
    <section className="managed-panel managed-stack">
      <h2>Current backing and monitoring</h2>
      <dl className="managed-facts">
        <div>
          <dt>RPC read health</dt>
          <dd>{observed.positions.health}</dd>
        </div>
        <div>
          <dt>Checked at</dt>
          <dd>{new Date(observed.positions.checkedAt).toLocaleString()}</dd>
        </div>
        <div>
          <dt>Read block</dt>
          <dd>{observed.positions.block?.number ?? "Unavailable"}</dd>
        </div>
        <div>
          <dt>Indexed through</dt>
          <dd>
            {observed.history.coverage?.indexedThrough?.number ?? "Unavailable"}
          </dd>
        </div>
      </dl>
      {observed.positions.positions.map((position) => {
        const history = observed.history.positions.find(
          (item) => item.position.id === position.position.id,
        );
        return (
          <div className="managed-pair" key={position.position.id}>
            <h3>
              {position.position.tokens
                .map(
                  (address) =>
                    tokens.find((token) => token.address === address)?.symbol ??
                    address,
                )
                .join(" / ")}{" "}
              / {position.registration}
            </h3>
            <div className="managed-table-wrap">
              <table className="managed-table">
                <thead>
                  <tr>
                    <th>Virtual allocation</th>
                    <th>Wallet balance</th>
                    <th>Aqua allowance</th>
                    <th>Inventory upper bound</th>
                  </tr>
                </thead>
                <tbody>
                  {position.backing.map((backing) => (
                    <tr key={backing.token}>
                      <td>
                        {display(backing.token, backing.virtualAllocation)}
                      </td>
                      <td>{display(backing.token, backing.walletBalance)}</td>
                      <td>{display(backing.token, backing.allowance)}</td>
                      <td>
                        {display(backing.token, backing.inventoryUpperBound)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="managed-footnote">
              Resolver discovery: {history?.resolverDiscovery ?? "unknown"}.
              Last successful quote: unavailable. Observed fills:{" "}
              {observed.history.coverage
                ? (history?.observedFills ?? "unavailable")
                : "unavailable"}
              . Monitoring: {history?.monitoringHealth ?? "unknown"}.
            </p>
          </div>
        );
      })}
      <p className="managed-footnote">
        Wallet balances may back sibling pairs and must not be summed across
        rows. An inventory upper bound does not guarantee that a particular
        trade can execute.
      </p>
    </section>
  );
}
