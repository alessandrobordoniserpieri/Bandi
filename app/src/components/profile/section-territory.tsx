// app/src/components/profile/section-territory.tsx
"use client";
import { useState } from "react";
import { PROVINCES, regionForProvince } from "@/lib/matching";
import type { ProfileRow } from "@/lib/profile/schema";
import { SelectField, TextField, MultiCheckbox } from "./fields";
import { OPERATING_SCOPE_OPTIONS } from "@/lib/profile/constants";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function SectionTerritory({ defaultValue }: { defaultValue?: Partial<ProfileRow> }) {
  const d = defaultValue ?? {};
  const [province, setProvince] = useState(d.province ?? "");
  const region = province ? (regionForProvince(province) ?? "") : (d.region ?? "");
  return (
    <>
      <div className="form-group">
        <label htmlFor="province">Provincia *</label>
        <Select name="province" defaultValue={d.province || undefined} required onValueChange={setProvince}>
          <SelectTrigger id="province" className="w-full">
            <SelectValue placeholder="— seleziona —" />
          </SelectTrigger>
          <SelectContent>
            {PROVINCES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <label>Regione (calcolata automaticamente)<input value={region} readOnly /></label>
      <TextField name="municipality" label="Comune sede" defaultValue={d.municipality ?? ""} />
      <SelectField name="operating_scope" label="Ambito operativo"
        options={OPERATING_SCOPE_OPTIONS} defaultValue={d.operating_scope ?? ""} />
      <MultiCheckbox name="operating_provinces" legend="Opera anche nelle province"
        options={PROVINCES} defaultValues={d.operating_provinces ?? []} />
    </>
  );
}
