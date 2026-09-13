import { getToken, type Symbol } from "@/lib/live-swap";
import styles from "./swap.module.css";

export function SwapTokenMark({
  symbol,
  small = false,
}: {
  symbol: Symbol;
  small?: boolean;
}) {
  const token = getToken(symbol);
  return (
    <span
      aria-hidden="true"
      className={`${styles.tokenMark} ${small ? styles.smallMark : ""}`}
      style={{ background: token.color }}
    >
      {token.mark}
    </span>
  );
}
