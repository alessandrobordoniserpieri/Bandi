// app/src/components/profile/section-territory.tsx
"use client";
import { useState } from "react";
import { PROVINCES, regionForProvince } from "@/lib/matching";
import type { ProfileRow } from "@/lib/profile/schema";
import { SelectField, TextField, MultiCheckbox } from "./fields";
import { OPERATING_SCOPE_OPTIONS } from "@/lib/profile/constants";

export function SectionTerritory({ defaultValue }: { defaultValue?: Partial<ProfileRow> }) {
  const d = defaultValue ?? {};
  const [province, setProvince] = useState(d.province ?? "");
  const region = province ? (regionForProvince(province) ?? "") : (d.region ?? "");
  return (
    <>
      <label>
        Provincia *
        <select name="province" defaultValue={d.province ?? ""} required
          onChange={(e) => setProvince(e.target.value)}>
          <option value="">— seleziona —</option>
          {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </label>
      <label>Regione (auto)<input value={region} readOnly /></label>
      <TextField name="municipality" label="Comune sede" defaultValue={d.municipality ?? ""} />
      <SelectField name="operating_scope" label="Ambito operativo"
        options={OPERATING_SCOPE_OPTIONS} defaultValue={d.operating_scope ?? ""} />
      <MultiCheckbox name="operating_provinces" legend="Opera anche nelle province"
        options={PROVINCES} defaultValues={d.operating_provinces ?? []} />
    </>
  );
}
