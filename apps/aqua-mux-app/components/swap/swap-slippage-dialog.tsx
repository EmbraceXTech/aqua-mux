import { Check, Info } from "lucide-react";
import { isValidSlippage } from "@/lib/swap-draft";
import type { Side } from "@/lib/live-swap";
import styles from "./swap.module.css";

type Props = {
  value: string;
  multi: Side;
  locked: boolean;
  onChange: (value: string) => void;
  onClose: () => void;
};
export function SwapSlippageDialog({
  value,
  multi,
  locked,
  onChange,
  onClose,
}: Props) {
  const valid = isValidSlippage(value);
  return (
    <div className={styles.dialogContent}>
      <div className={styles.slippageOptions}>
        {["0.1", "0.5", "1"].map((preset) => (
          <button
            key={preset}
            disabled={locked}
            aria-pressed={value === preset}
            className={value === preset ? styles.selectedExact : ""}
            onClick={() => onChange(preset)}
          >
            {preset}%
          </button>
        ))}
        <label>
          <input
            disabled={locked}
            aria-label="Custom slippage percent"
            inputMode="decimal"
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
          %
        </label>
      </div>
      {!valid ? (
        <p role="alert" className={styles.errorText}>
          Enter 0.01% to 5%, with up to two decimal places.
        </p>
      ) : Number(value) > 1 ? (
        <p className={styles.warning}>
          High slippage allows a less favorable execution price.
        </p>
      ) : (
        <p className={styles.settingsNote}>
          If any leg exceeds its limit, the entire swap reverts.
        </p>
      )}
      <div className={styles.settingsInfo}>
        <Info size={16} />
        <p>
          Each {multi} token selects a Uniswap v3 pool fee tier. Fees go to the
          pool, not AquaMux.
        </p>
      </div>
      <button
        className={styles.primaryButton}
        disabled={!valid}
        onClick={onClose}
      >
        Done <Check size={16} />
      </button>
    </div>
  );
}
