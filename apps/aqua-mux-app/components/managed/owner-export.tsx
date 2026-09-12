import { useEffect, useRef, useState } from "react";
import { managedRequest, type ManagedSession } from "@/lib/managed-client/api";
import { Button } from "../ui/button";

export function OwnerExport({ session }: { session: ManagedSession }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  async function download() {
    setBusy(true);
    setError("");
    try {
      const records = await managedRequest<unknown>("/export", session);
      if (!active.current) return;
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(records, null, 2)], {
          type: "application/json",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `aquamux-${session.owner}-records.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      if (active.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "Export unavailable. Retry after reconnecting.",
        );
    } finally {
      if (active.current) setBusy(false);
    }
  }
  return (
    <div>
      <Button variant="outline" disabled={busy} onClick={() => void download()}>
        {busy ? "Preparing records..." : "Download my records"}
      </Button>
      {error && (
        <p role="alert" className="managed-error">
          {error}
        </p>
      )}
    </div>
  );
}
