"use client";
import { useState, useTransition } from "react";
import { updateNotes } from "@/lib/saved-grants/actions";
import { Button } from "@/components/ui/button";

export function NotesEditor({
  savedGrantId,
  initialNotes,
}: {
  savedGrantId: string;
  initialNotes: string | null;
}) {
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  return (
    <div style={{ marginTop: "0.5rem" }}>
      <textarea
        rows={2}
        value={notes}
        placeholder="Note…"
        onChange={(e) => {
          setNotes(e.target.value);
          setSaved(false);
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => start(async () => {
          const res = await updateNotes(savedGrantId, notes);
          if ("ok" in res) setSaved(true);
        })}
      >
        {pending ? "Salvataggio…" : saved ? "Salvato ✓" : "Salva note"}
      </Button>
    </div>
  );
}
