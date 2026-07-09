"use client";
import { useTransition } from "react";
import Link from "next/link";
import { updateStatus } from "@/lib/saved-grants/actions";
import { nextStatuses, statusLabel, type SavedGrantStatus } from "@/lib/saved-grants/status";
import type { SavedGrantView } from "@/lib/saved-grants/queries";
import { NotesEditor } from "./notes-editor";

export function SavedGrantCard({ item }: { item: SavedGrantView }) {
  const [pending, start] = useTransition();
  const targets = nextStatuses(item.status);

  return (
    <article className="kanban-card">
      <h3><Link href={`/bandi/${item.grant.id}`}>{item.grant.title}</Link></h3>
      {item.providerName && <p className="kanban-card-provider">{item.providerName}</p>}

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
