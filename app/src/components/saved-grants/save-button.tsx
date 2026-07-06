"use client";
import { useState, useTransition } from "react";
import { saveGrant, removeSavedGrant } from "@/lib/saved-grants/actions";
import { statusLabel, type SavedGrantStatus } from "@/lib/saved-grants/status";

// Detail-page toggle: save the grant (→ "salvato") or remove it, reflecting the current status.
export function SaveButton({
  grantId,
  initialStatus,
}: {
  grantId: string;
  initialStatus: SavedGrantStatus | null;
}) {
  const [status, setStatus] = useState<SavedGrantStatus | null>(initialStatus);
  const [pending, start] = useTransition();

  function toggle() {
    start(async () => {
      if (status) {
        const res = await removeSavedGrant(grantId);
        if ("ok" in res) setStatus(null);
      } else {
        const res = await saveGrant(grantId);
        if ("ok" in res) setStatus("salvato");
      }
    });
  }

  return (
    <button type="button" onClick={toggle} disabled={pending} aria-pressed={status !== null}>
      {status ? `Rimuovi dai salvati (${statusLabel(status)})` : "Salva"}
    </button>
  );
}
