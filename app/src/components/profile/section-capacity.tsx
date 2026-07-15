// app/src/components/profile/section-capacity.tsx
"use client";
import { useState } from "react";
import { calculateCapacity, type CapacityAnswers } from "@/lib/matching";
import type { ProfileRow } from "@/lib/profile/schema";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STAFF = ["0-2", "3-10", "11-30", "30+"] as const;
const FUNDED = ["0", "1-2", "3-5", "5+"] as const;
const REPORT = ["mai", "qualche_volta", "regolarmente"] as const;
const BUDGET = ["<20k", "20-100k", "100-500k", ">500k"] as const;

type Answers = {
  stableStaff: string; dedicatedAdmin: boolean; fundedProjects3y: string;
  reportingExperience: string; annualBudget: string; euProject: boolean;
};

function CapacitySelect({ name, label, value, options, onChange }: {
  name: string; label: string; value: string; options: readonly string[]; onChange: (v: string) => void;
}) {
  return (
    <div className="form-group">
      <label htmlFor={name}>{label}</label>
      <Select name={name} value={value || undefined} onValueChange={onChange}>
        <SelectTrigger id={name} className="w-full">
          <SelectValue placeholder="— seleziona —" />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

export function SectionCapacity({ defaultValue }: { defaultValue?: Partial<ProfileRow> }) {
  const d = defaultValue ?? {};
  const [a, setA] = useState<Answers>({
    stableStaff: d.stable_staff ?? "",
    dedicatedAdmin: d.dedicated_admin ?? false,
    fundedProjects3y: d.funded_projects_3y ?? "",
    reportingExperience: d.reporting_experience ?? "",
    annualBudget: d.annual_budget ?? "",
    euProject: d.eu_project ?? false,
  });

  const complete =
    a.stableStaff !== "" && a.fundedProjects3y !== "" &&
    a.reportingExperience !== "" && a.annualBudget !== "";
  const level = complete ? calculateCapacity(a as unknown as CapacityAnswers) : null;

  return (
    <>
      <CapacitySelect name="stable_staff" label="Persone stabili" value={a.stableStaff} options={STAFF}
        onChange={(v) => setA({ ...a, stableStaff: v })} />
      <label>
        <input name="dedicated_admin" type="checkbox" checked={a.dedicatedAdmin}
          onChange={(e) => setA({ ...a, dedicatedAdmin: e.target.checked })} />
        {" "}Persona dedicata all'amministrazione
      </label>
      <CapacitySelect name="funded_projects_3y" label="Progetti finanziati (ultimi 3 anni)" value={a.fundedProjects3y} options={FUNDED}
        onChange={(v) => setA({ ...a, fundedProjects3y: v })} />
      <CapacitySelect name="reporting_experience" label="Esperienza di rendicontazione" value={a.reportingExperience} options={REPORT}
        onChange={(v) => setA({ ...a, reportingExperience: v })} />
      <CapacitySelect name="annual_budget" label="Budget annuale" value={a.annualBudget} options={BUDGET}
        onChange={(v) => setA({ ...a, annualBudget: v })} />
      <label>
        <input name="eu_project" type="checkbox" checked={a.euProject}
          onChange={(e) => setA({ ...a, euProject: e.target.checked })} />
        {" "}Ha gestito un progetto europeo
      </label>
      <p>Capacità calcolata: <strong>{level ?? "—"}</strong>{" "}
        {level === null && "(compila tutte e 6 le domande)"}</p>
    </>
  );
}
