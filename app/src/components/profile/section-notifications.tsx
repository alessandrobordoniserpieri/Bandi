"use client";
import { useState, useTransition } from "react";
import { updateAlertSettings, type AlertFrequency } from "@/lib/settings/actions";

// Profile "Notifiche" section: weekly-digest score threshold (0–100, default 50) + frequency.
export function SectionNotifications({
  initialThreshold,
  initialFrequency,
}: {
  initialThreshold: number;
  initialFrequency: AlertFrequency;
}) {
  const [threshold, setThreshold] = useState(initialThreshold);
  const [frequency, setFrequency] = useState<AlertFrequency>(initialFrequency);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  return (
    <section>
      <h2>Notifiche</h2>
      <p>Digest email settimanale con i nuovi bandi compatibili col tuo profilo.</p>

      <label>
        Frequenza{" "}
        <select
          value={frequency}
          onChange={(e) => { setFrequency(e.target.value as AlertFrequency); setSaved(false); }}
        >
          <option value="weekly">Settimanale</option>
          <option value="off">Disattivata</option>
        </select>
      </label>

      <div>
        <label>
          Soglia di compatibilità: <strong>{threshold}</strong>/100{" "}
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={threshold}
            disabled={frequency === "off"}
            onChange={(e) => { setThreshold(Number(e.target.value)); setSaved(false); }}
          />
        </label>
      </div>

      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => {
          const res = await updateAlertSettings(threshold, frequency);
          if ("ok" in res) setSaved(true);
        })}
      >
        {pending ? "Salvataggio…" : saved ? "Salvato ✓" : "Salva preferenze"}
      </button>
    </section>
  );
}
