import { classicRouter } from "@/lib/config";
import { getToken, SWAP_CHAIN, type LiveQuote } from "@/lib/live-swap";
import { SwapTokenMark } from "./swap-token-mark";
import styles from "./swap.module.css";

export function SwapReviewSummary({
  quote,
  account,
}: {
  quote: LiveQuote;
  account: string;
}) {
  const router = classicRouter(SWAP_CHAIN);
  return (
    <>
      {(["input", "output"] as const).map((side) => (
        <div className={styles.reviewGroup} key={side}>
          <h3>{side === "input" ? "You pay" : "You receive"}</h3>
          {quote.request.draft[side].map((item, index) => (
            <div key={item.symbol}>
              <SwapTokenMark symbol={item.symbol} small />
              <strong>
                {quote.amounts[side][index]} {getToken(item.symbol).symbol}
              </strong>
            </div>
          ))}
          {side === "output" && (
            <p className={styles.settingsNote}>
              Minimum receive: {quote.limits.output[0]}{" "}
              {getToken(quote.request.draft.output[0].symbol).symbol}
            </p>
          )}
        </div>
      ))}
      <div className={styles.reviewFees}>
        <strong>1inch route</strong>
        <span>
          Slippage<b>{quote.request.slippageBps / 100}%</b>
        </span>
      </div>
      <p className={styles.settingsNote}>
        Recipient: {account}
        <br />
        Router:{" "}
        <a
          href={`https://arbiscan.io/address/${router}`}
          target="_blank"
          rel="noreferrer"
        >
          {router}
        </a>
        <br />
        Each route is a separate 1inch Classic Swap transaction. Legs are not
        atomic, and every leg needs its own wallet confirmation. Network gas is
        additional and shown by MetaMask. This quote expires in 30 seconds.
      </p>
    </>
  );
}
