import type { Mode } from "@/lib/live-swap";
import styles from "./swap.module.css";

type Props = {
  mode: Mode;
  locked: boolean;
  onModeChange: (mode: Mode) => void;
};
export function SwapModeControls({ mode, locked, onModeChange }: Props) {
  return (
    <div className={styles.builderControls}>
      <div className={styles.modeSwitch} role="group" aria-label="Swap mode">
        {(["multi-out", "multi-in"] as const).map((value) => (
          <button
            key={value}
            disabled={locked}
            aria-pressed={mode === value}
            className={mode === value ? styles.activeMode : ""}
            onClick={() => onModeChange(value)}
          >
            {value === "multi-in" ? "Multiple in" : "Multiple out"}
          </button>
        ))}
      </div>
      <p className={styles.amountHint}>
        Each 1inch leg uses an exact input amount and requires a separate wallet
        confirmation.
      </p>
    </div>
  );
}
