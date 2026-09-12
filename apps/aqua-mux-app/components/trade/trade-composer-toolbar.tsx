import type { ReactNode } from "react";
import { Settings2 } from "lucide-react";

export function TradeComposerToolbar({
  icon,
  label,
  onOpenSettings,
}: {
  icon: ReactNode;
  label: string;
  onOpenSettings: () => void;
}) {
  return (
    <div className="composer-toolbar">
      <div className="mode-tabs">
        <span className="selected">
          {icon}
          {label}
        </span>
      </div>
      <button
        className="icon-button ghost-button"
        onClick={onOpenSettings}
        aria-label="Transaction settings"
      >
        <Settings2 size={18} />
      </button>
    </div>
  );
}
