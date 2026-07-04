// app/src/components/profile/section-history.tsx
"use client";
import { useState } from "react";
import type { ProfileRow } from "@/lib/profile/schema";
import { CheckboxField, SelectField, MultiCheckbox } from "./fields";
import {
  OUTCOME_OPTIONS, COFUNDING_OPTIONS, INCOME_SOURCE_OPTIONS,
} from "@/lib/profile/constants";

type HistoryRow = {
  grant_name: string; provider_id: string | null; year: number | null;
  outcome: string; amount: number | null; kind: string | null;
};

export function SectionHistory(
  { defaultValue, providers }:
  { defaultValue?: Partial<ProfileRow>; providers?: { id: string; name: string }[] },
) {
  const d = defaultValue ?? {};
  const initial = Array.isArray(d.project_history) ? (d.project_history as HistoryRow[]) : [];
  const [rows, setRows] = useState<HistoryRow[]>(initial);

  function update(i: number, patch: Partial<HistoryRow>) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }
  function add() {
    setRows((rs) => [...rs, { grant_name: "", provider_id: null, year: null,
      outcome: "finanziato", amount: null, kind: null }]);
  }
  function remove(i: number) { setRows((rs) => rs.filter((_, j) => j !== i)); }

  return (
    <>
      <input type="hidden" name="project_history" value={JSON.stringify(rows)} readOnly />
      <fieldset>
        <legend>Storico progetti</legend>
        {rows.map((r, i) => (
          <div key={i}>
            <input placeholder="Nome bando" value={r.grant_name}
              onChange={(e) => update(i, { grant_name: e.target.value })} />
            <select value={r.provider_id ?? ""}
              onChange={(e) => update(i, { provider_id: e.target.value || null })}>
              <option value="">— erogatore —</option>
              {(providers ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <input placeholder="Anno" type="number" value={r.year ?? ""}
              onChange={(e) => update(i, { year: e.target.value ? Number(e.target.value) : null })} />
            <select value={r.outcome} onChange={(e) => update(i, { outcome: e.target.value })}>
              {OUTCOME_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            <input placeholder="Importo" type="number" value={r.amount ?? ""}
              onChange={(e) => update(i, { amount: e.target.value ? Number(e.target.value) : null })} />
            <button type="button" onClick={() => remove(i)}>Rimuovi</button>
          </div>
        ))}
        <button type="button" onClick={add}>Aggiungi progetto</button>
      </fieldset>
      <CheckboxField name="public_funds" label="Fondi pubblici ricevuti" defaultChecked={d.public_funds} />
      <CheckboxField name="private_funds" label="Fondi privati ricevuti" defaultChecked={d.private_funds} />
      <CheckboxField name="eu_funds" label="Fondi EU ricevuti" defaultChecked={d.eu_funds} />
      <SelectField name="cofunding_capacity" label="Capacità di cofinanziamento (%)"
        options={COFUNDING_OPTIONS}
        defaultValue={d.cofunding_capacity != null ? String(d.cofunding_capacity) : ""} />
      <MultiCheckbox name="income_sources" legend="Fonti di entrata"
        options={[...INCOME_SOURCE_OPTIONS]} defaultValues={d.income_sources ?? []} />
    </>
  );
}
