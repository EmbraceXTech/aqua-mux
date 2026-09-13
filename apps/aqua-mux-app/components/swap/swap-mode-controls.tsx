import type { Mode, Side } from "@/lib/live-swap";
import styles from "./swap.module.css";

type Props = {
  mode: Mode;
  exact: Side;
  locked: boolean;
  onModeChange: (mode: Mode) => void;
  onExactChange: (side: Side) => void;
};
export function SwapModeControls({
  mode,
  exact,
  locked,
  onModeChange,
  onExactChange,
}: Props) {
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
      <div className={styles.amountSettings}>
        <div className={styles.exactControl}>
          <span>Set amounts for</span>
          <div>
            {(["input", "output"] as const).map((side) => (
              <button
                key={side}
                disabled={locked}
                aria-pressed={exact === side}
                className={exact === side ? styles.selectedExact : ""}
                onClick={() => onExactChange(side)}
              >
                {side === "input" ? "You pay" : "You receive"}
              </button>
            ))}
          </div>
        </div>
        <p className={styles.amountHint}>
          {exact === "input"
            ? "Fix what you spend. We'll quote what you receive."
            : "Fix what you receive. We'll quote the maximum spend."}
          {mode === "multi-in" && exact === "output"
            ? " Allocation splits the requested output between input routes."
            : ""}
        </p>
      </div>
    </div>
  );
}
