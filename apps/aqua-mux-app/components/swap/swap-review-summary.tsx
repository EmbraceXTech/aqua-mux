import {
  V3_ROUTER,
  SWAP_DEADLINE_SECONDS,
  type LiveQuote,
} from "@/lib/live-swap";
import { SwapTokenMark } from "./swap-token-mark";
import styles from "./swap.module.css";

export function SwapReviewSummary({
  quote,
  account,
}: {
  quote: LiveQuote;
  account: string;
}) {
  return (
    <>
      {(["input", "output"] as const).map((side) => (
        <div className={styles.reviewGroup} key={side}>
          <h3>
            {side === "input" ? "You pay" : "You receive"}
            <span>
              {quote.request.draft.exact === side ? "Exact" : "Estimated"}
            </span>
          </h3>
          {quote.request.draft[side].map((item, index) => (
            <div key={item.symbol}>
              <SwapTokenMark symbol={item.symbol} small />
              <strong>
                {quote.amounts[side][index]} {item.symbol}
              </strong>
            </div>
          ))}
          {quote.request.draft.exact !== side &&
            quote.request.draft[side].map((item, index) => (
              <p className={styles.settingsNote} key={item.symbol}>
                {side === "input" ? "Maximum spend" : "Minimum receive"}:{" "}
                {quote.limits[side][index]} {item.symbol}
              </p>
            ))}
        </div>
      ))}
      <div className={styles.reviewFees}>
        <strong>Pool routes</strong>
        {quote.legs.map((leg) => (
          <span key={`${leg.input}-${leg.output}`}>
            {leg.input} → {leg.output}
            <b>{leg.fee / 10000}%</b>
          </span>
        ))}
        <span>
          Slippage<b>{quote.request.slippageBps / 100}%</b>
        </span>
      </div>
      <p className={styles.settingsNote}>
        Recipient: {account}
        <br />
        Router:{" "}
        <a
          href={`https://arbiscan.io/address/${V3_ROUTER}`}
          target="_blank"
          rel="noreferrer"
        >
          {V3_ROUTER}
        </a>
        <br />
        Method: multicall. Network gas is additional and shown by MetaMask.
        Exact-output swaps refund unused ETH. The router deadline is{" "}
        {SWAP_DEADLINE_SECONDS / 60} minutes from preparation. Reject an expired
        wallet request; do not confirm it.
      </p>
    </>
  );
}
