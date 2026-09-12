import type { GroupDetail } from "@/lib/managed-client/api";
import { amountLabel, dateLabel, priceLabel, titleLabel } from "./format";

export function StrategyView({ detail }: { detail: GroupDetail }) {
  const { group, bot } = detail;
  const review = detail.reviews?.toSorted(
    (a, b) => b.createdAt - a.createdAt,
  )[0];
  return (
    <div className="managed-stack">
      <section className="managed-panel">
        <h2>Current strategy</h2>
        <dl className="managed-facts">
          <div>
            <dt>Recipe</dt>
            <dd>
              {titleLabel(group.config.recipeId)} v{group.config.recipeVersion}
            </dd>
          </div>
          <div>
            <dt>Review mode</dt>
            <dd>
              {bot.mode === "manual"
                ? "Every transaction requires confirmation"
                : "Delegated execution"}
            </dd>
          </div>
          <div>
            <dt>Review interval</dt>
            <dd>{bot.intervalMs / 60_000} minutes</dd>
          </div>
          <div>
            <dt>Next review due</dt>
            <dd>
              {bot.state === "running"
                ? dateLabel(bot.nextDueAt)
                : "Management is not running"}
            </dd>
          </div>
          <div>
            <dt>Last decision</dt>
            <dd>
              {review?.result
                ? titleLabel(review.result.decision)
                : review
                  ? titleLabel(review.status)
                  : "No completed review"}
            </dd>
          </div>
          <div>
            <dt>Policy expiry</dt>
            <dd>{dateLabel(group.config.policy.expiresAt.value)}</dd>
          </div>
        </dl>
        {review && (
          <div className="managed-summary" style={{ marginTop: 22 }}>
            <p>
              {review.result?.rationale ??
                (review.errors.join(" ") ||
                  "Review is pending. No transaction is authorized.")}
            </p>
            <p className="managed-footnote">
              {dateLabel(review.createdAt)} / {review.provider} / {review.model}
            </p>
          </div>
        )}
      </section>
      {group.config.family === "lp" && (
        <section className="managed-panel">
          <h2>Pair parameters</h2>
          <div className="managed-table-wrap">
            <table className="managed-table">
              <thead>
                <tr>
                  <th>Pair</th>
                  <th>Opening price</th>
                  <th>Range</th>
                  <th>Virtual reserves</th>
                  <th>Fee</th>
                </tr>
              </thead>
              <tbody>
                {group.config.pairs.map((pair) => (
                  <tr
                    key={`${pair.baseToken.address}:${pair.quoteToken.address}`}
                  >
                    <td>
                      {pair.baseToken.symbol} / {pair.quoteToken.symbol}
                    </td>
                    <td>
                      {priceLabel(pair.openingPrice)} {pair.quoteToken.symbol}{" "}
                      per {pair.baseToken.symbol}
                    </td>
                    <td>
                      {pair.range.kind === "full"
                        ? "Full range"
                        : `${priceLabel(pair.range.lower)} to ${priceLabel(pair.range.upper)} ${pair.quoteToken.symbol}`}
                    </td>
                    <td>
                      {amountLabel({
                        token: pair.baseToken,
                        amount: pair.baseAmount,
                      })}
                      <br />
                      {amountLabel({
                        token: pair.quoteToken,
                        amount: pair.quoteAmount,
                      })}
                    </td>
                    <td>{pair.feeBps / 100}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="managed-footnote">
            Virtual allocations share real inventory. Adding the allocations
            does not measure the capital in this group.
          </p>
        </section>
      )}
      <section className="managed-panel">
        <h2>Management limits</h2>
        <dl className="managed-facts">
          <div>
            <dt>Spend budgets</dt>
            <dd>
              {group.config.policy.spendBudgets.value.length
                ? group.config.policy.spendBudgets.value
                    .map(amountLabel)
                    .join(", ")
                : "No token spend budget recorded"}{" "}
              / {group.config.policy.spendBudgets.enforcedBy}
            </dd>
          </div>
          <div>
            <dt>Gas budget, raw native units</dt>
            <dd>
              {group.config.policy.gasBudgetWei.value} /{" "}
              {group.config.policy.gasBudgetWei.enforcedBy}
            </dd>
          </div>
          <div>
            <dt>Maximum reference age</dt>
            <dd>
              {group.config.policy.maxReferenceAgeMs.value / 1000} seconds /{" "}
              {group.config.policy.maxReferenceAgeMs.enforcedBy}
            </dd>
          </div>
          <div>
            <dt>Advisory review signals</dt>
            <dd>
              Range exit:{" "}
              {group.config.policy.triggers.value.rangeExit
                ? "enabled"
                : "disabled"}
              . Inventory drift:{" "}
              {group.config.policy.triggers.value.inventoryDriftBps / 100}%.
              These signals inform reviews; the broker does not enforce their
              thresholds.
            </dd>
          </div>
          <div>
            <dt>Replacement direction</dt>
            <dd>
              {group.config.policy.triggers.value.upwardOnly
                ? "Upward-only, enforced by the execution broker."
                : "Upward-only restriction is disabled."}
            </dd>
          </div>
          <div>
            <dt>Allowed actions</dt>
            <dd>
              {group.config.policy.allowedActions.value
                .map(titleLabel)
                .join(", ")}
            </dd>
          </div>
          <div>
            <dt>Action limit</dt>
            <dd>
              {group.config.policy.maxActions.value} /{" "}
              {group.config.policy.maxActions.enforcedBy}
            </dd>
          </div>
          <div>
            <dt>Cooldown</dt>
            <dd>
              {group.config.policy.cooldownMs.value / 60_000} minutes /{" "}
              {group.config.policy.cooldownMs.enforcedBy}
            </dd>
          </div>
          <div>
            <dt>Maximum slippage</dt>
            <dd>
              {group.config.policy.maxSlippageBps.value / 100}% /{" "}
              {group.config.policy.maxSlippageBps.enforcedBy}
            </dd>
          </div>
        </dl>
        <details className="managed-footnote">
          <summary>Permitted token and route addresses</summary>
          <p>Assets / {group.config.policy.allowedAssets.enforcedBy}</p>
          {group.config.policy.allowedAssets.value.map((address) => (
            <p className="managed-address" key={address}>
              {address}
            </p>
          ))}
          <p>Routes / {group.config.policy.allowedRoutes.enforcedBy}</p>
          {group.config.policy.allowedRoutes.value.length ? (
            group.config.policy.allowedRoutes.value.map((address) => (
              <p className="managed-address" key={address}>
                {address}
              </p>
            ))
          ) : (
            <p>No routes recorded.</p>
          )}
        </details>
      </section>
    </div>
  );
}
