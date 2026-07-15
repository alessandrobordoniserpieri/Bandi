// app/src/components/profile/section-history.tsx
"use client";
import { useState } from "react";
import type { ProfileRow } from "@/lib/profile/schema";
import { CheckboxField, SelectField, MultiCheckbox } from "./fields";
import {
  OUTCOME_OPTIONS, COFUNDING_OPTIONS, INCOME_SOURCE_OPTIONS,
} from "@/lib/profile/constants";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

type HistoryRow = {
  grant_name: string; provider_id: string | null; year: number | null;
  outcome: string; amount: number | null; kind: string | null;
};

function RowSelect({ value, placeholder, options, onChange }: {
  value: string; placeholder: string; options: { value: string; label: string }[]; onChange: (v: string) => void;
}) {
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger className="w-full"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

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
            <RowSelect value={r.provider_id ?? ""} placeholder="— erogatore —"
              options={(providers ?? []).map((p) => ({ value: p.id, label: p.name }))}
              onChange={(v) => update(i, { provider_id: v || null })} />
            <input placeholder="Anno" type="number" value={r.year ?? ""}
              onChange={(e) => update(i, { year: e.target.value ? Number(e.target.value) : null })} />
            <RowSelect value={r.outcome} placeholder="Esito"
              options={OUTCOME_OPTIONS.map((o) => ({ value: o, label: o }))}
              onChange={(v) => update(i, { outcome: v })} />
            <input placeholder="Importo" type="number" value={r.amount ?? ""}
              onChange={(e) => update(i, { amount: e.target.value ? Number(e.target.value) : null })} />
            <RowSelect value={r.kind ?? ""} placeholder="— tipo fondo —"
              options={[{ value: "pubblico", label: "Pubblico" }, { value: "privato", label: "Privato" }, { value: "eu", label: "UE" }]}
              onChange={(v) => update(i, { kind: v || null })} />
            <Button type="button" variant="outline" size="sm" onClick={() => remove(i)}>Rimuovi</Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={add}>Aggiungi progetto</Button>
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
