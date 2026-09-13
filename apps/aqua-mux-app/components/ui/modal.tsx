"use client";
import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  finalFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: React.ReactNode;
  finalFocus?: React.ComponentProps<typeof Dialog.Popup>["finalFocus"];
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="modal-backdrop" />
        <Dialog.Popup className="modal-popup" finalFocus={finalFocus}>
          <div className="modal-heading">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close
              className="icon-button ghost-button"
              aria-label="Close dialog"
            >
              <X size={20} />
            </Dialog.Close>
          </div>
          <Dialog.Description className="muted modal-description">
            {description}
          </Dialog.Description>
          {children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
