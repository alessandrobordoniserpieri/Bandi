"use client";
import { useTransition } from "react";
import Link from "next/link";
import { updateStatus } from "@/lib/saved-grants/actions";
import { nextStatuses, statusLabel, type SavedGrantStatus } from "@/lib/saved-grants/status";
import type { SavedGrantView } from "@/lib/saved-grants/queries";
import { VerdictBadge } from "@/components/grants/verdict-badge";
import { DeadlineBadge } from "@/components/grants/deadline-badge";
import { NotesEditor } from "./notes-editor";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function SavedGrantCard({ item }: { item: SavedGrantView }) {
  const [pending, start] = useTransition();
  const targets = nextStatuses(item.status);

  return (
    <article className="kanban-card">
      {/* Hierarchy: title → provider → matching badges. Title is the click target (whole heading). */}
      <h3 className="kanban-card-title">
        <Link href={`/bandi/${item.grant.id}`}>{item.grant.title}</Link>
      </h3>
      {item.providerName && <p className="kanban-card-provider">{item.providerName}</p>}

      {/* DEC-2: verdict + deadline — the two at-a-glance cues for "do I need to act now?".
          No 6-dimension breakdown here; that stays in the detail view. */}
      <div className="kanban-card-badges">
        {item.verdict && <VerdictBadge verdict={item.verdict} />}
        <DeadlineBadge indicator={item.deadline} />
      </div>

      <div className="form-group">
        <label htmlFor={`move-${item.savedGrantId}`}>Sposta a</label>
        <Select
          value={item.status}
          disabled={pending || targets.length === 0}
          onValueChange={(v) => start(async () => {
            await updateStatus(item.savedGrantId, v as SavedGrantStatus);
          })}
        >
          <SelectTrigger id={`move-${item.savedGrantId}`} size="sm" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={item.status}>{statusLabel(item.status)}</SelectItem>
            {targets.map((s) => (
              <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <NotesEditor savedGrantId={item.savedGrantId} initialNotes={item.notes} />
    </article>
  );
}
