"use client";
import { useState, useTransition } from "react";
import { updateAlertSettings, type AlertFrequency } from "@/lib/settings/actions";

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
    <section className="settings-card">
      <h2>Notifiche</h2>
      <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>
        Digest email settimanale con i nuovi bandi compatibili col tuo profilo.
      </p>

      <div className="form-group" style={{ marginBottom: "1rem" }}>
        <label htmlFor="alert-frequency">Frequenza</label>
        <select
          id="alert-frequency"
          value={frequency}
          onChange={(e) => { setFrequency(e.target.value as AlertFrequency); setSaved(false); }}
        >
          <option value="weekly">Settimanale</option>
          <option value="off">Disattivata</option>
        </select>
      </div>

      <div className="form-group" style={{ marginBottom: "1rem" }}>
        <label htmlFor="alert-threshold">
          Soglia di compatibilità: <strong>{threshold}</strong>/100
        </label>
        <input
          id="alert-threshold"
          type="range"
          min={0}
          max={100}
          step={5}
          value={threshold}
          disabled={frequency === "off"}
          onChange={(e) => { setThreshold(Number(e.target.value)); setSaved(false); }}
        />
      </div>

      <div className="form-actions">
        <button
          type="button"
          className="btn-primary btn-sm"
          disabled={pending}
          onClick={() => start(async () => {
            const res = await updateAlertSettings(threshold, frequency);
            if ("ok" in res) setSaved(true);
          })}
        >
          {pending ? "Salvataggio…" : saved ? "Salvato ✓" : "Salva preferenze"}
        </button>
      </div>
    </section>
  );
}
