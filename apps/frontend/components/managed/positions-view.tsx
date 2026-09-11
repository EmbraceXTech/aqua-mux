import type { GroupDetail } from "@/lib/managed-client/api";
import { amountLabel, titleLabel } from "./format";

export function PositionsView({ detail }: { detail: GroupDetail }) {
  return (
    <div className="managed-stack">
      <section className="managed-panel">
        <h2>Managed inventory</h2>
        {detail.group.inventory.length ? (
          <div className="managed-facts">
            {detail.group.inventory.map((item) => (
              <div key={item.token.address}>
                <dt>{item.token.symbol}</dt>
                <dd>
                  {amountLabel(item)}
                  <br />
                  <span className="managed-address">{item.token.address}</span>
                </dd>
              </div>
            ))}
          </div>
        ) : (
          <p className="managed-empty">
            No attributable inventory has been recorded.
          </p>
        )}
        <p className="managed-footnote">
          Each token is counted once for this group. These are durable managed
          records; refresh reconciliation to check current chain state.
          Unrelated wallet assets are outside this scope.
        </p>
      </section>
      <section className="managed-panel">
        <h2>Positions</h2>
        {detail.strategies?.length ? (
          <div className="managed-table-wrap">
            <table className="managed-table">
              <thead>
                <tr>
                  <th>Pair</th>
                  <th>Registration</th>
                  <th>Strategy hash</th>
                  <th>Backing and discovery</th>
                </tr>
              </thead>
              <tbody>
                {detail.strategies.map((position) => (
                  <tr key={position.id}>
                    <td>
                      {position.tokens.map((token) => token.symbol).join(" / ")}
                    </td>
                    <td>
                      {titleLabel(position.state)}
                      <br />
                      {position.registrationBlock
                        ? `Block ${position.registrationBlock}`
                        : "Confirmation block unavailable"}
                    </td>
                    <td className="managed-address">{position.hash}</td>
                    <td>
                      See reconciliation evidence. Registration alone does not
                      establish backing, discovery, or executable fills.
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="managed-empty">
            {detail.strategies
              ? "No registered positions in this group."
              : "Position records are unavailable. Refresh reconciliation before taking action."}
          </p>
        )}
      </section>
      <div className="managed-notice">
        Realized performance, unrealized performance, and fee decomposition are
        unavailable until attributable observations support them. Unavailable
        values are not zero returns.
      </div>
    </div>
  );
}
