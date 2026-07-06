"use client";
import { useTransition } from "react";
import Link from "next/link";
import { updateStatus } from "@/lib/saved-grants/actions";
import { nextStatuses, statusLabel, STATUS_META, type SavedGrantStatus } from "@/lib/saved-grants/status";
import type { SavedGrantView } from "@/lib/saved-grants/queries";
import { NotesEditor } from "./notes-editor";

// One saved grant. The <select> offers only the valid next states (state machine); changing it
// runs updateStatus, and revalidation re-renders the board with the card in its new column.
export function SavedGrantCard({ item }: { item: SavedGrantView }) {
  const [pending, start] = useTransition();
  const targets = nextStatuses(item.status);

  return (
    <article style={{ borderLeft: `4px solid ${STATUS_META[item.status].color}`, padding: "0.5rem", marginBottom: "0.5rem" }}>
      <Link href={`/bandi/${item.grant.id}`}>{item.grant.title}</Link>
      {item.providerName && <p>{item.providerName}</p>}

      <label>
        Sposta a{" "}
        <select
          value={item.status}
          disabled={pending || targets.length === 0}
          onChange={(e) => start(async () => {
            await updateStatus(item.savedGrantId, e.target.value as SavedGrantStatus);
          })}
        >
          <option value={item.status}>{statusLabel(item.status)}</option>
          {targets.map((s) => (
            <option key={s} value={s}>{statusLabel(s)}</option>
          ))}
        </select>
      </label>

      <NotesEditor savedGrantId={item.savedGrantId} initialNotes={item.notes} />
    </article>
  );
}
