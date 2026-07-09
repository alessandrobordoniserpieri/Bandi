"use client";
import { useTransition } from "react";
import { setDensity } from "@/lib/grants/actions";
import type { DensityMode } from "@/lib/grants/view-density";

export function DensityToggle({ current }: { current: DensityMode }) {
  const [pending, start] = useTransition();

  function set(mode: DensityMode) {
    if (mode === current || pending) return;
    start(async () => {
      await setDensity(mode);
    });
  }

  return (
    <div className="density-toggle" data-density={current}>
      <button
        type="button"
        aria-pressed={current === "card"}
        disabled={pending}
        onClick={() => set("card")}
      >
        Vista a card
      </button>
      <button
        type="button"
        aria-pressed={current === "compact"}
        disabled={pending}
        onClick={() => set("compact")}
      >
        Vista compatta
      </button>
    </div>
  );
}
