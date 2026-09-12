import { ShieldCheck } from "lucide-react";

export function TradeExecutionNote({
  message,
  onOpenHow,
}: {
  message: string;
  onOpenHow: () => void;
}) {
  return (
    <div className="execution-note">
      <ShieldCheck size={16} />
      <span>{message}</span>
      <button aria-label="How AquaMux works" onClick={onOpenHow}>
        i
      </button>
    </div>
  );
}
