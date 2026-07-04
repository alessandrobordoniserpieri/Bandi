// app/src/components/profile/section-capacity.tsx
"use client";
import { useState } from "react";
import { calculateCapacity, type CapacityAnswers } from "@/lib/matching";
import type { ProfileRow } from "@/lib/profile/schema";

const STAFF = ["0-2", "3-10", "11-30", "30+"] as const;
const FUNDED = ["0", "1-2", "3-5", "5+"] as const;
const REPORT = ["mai", "qualche_volta", "regolarmente"] as const;
const BUDGET = ["<20k", "20-100k", "100-500k", ">500k"] as const;

type Answers = {
  stableStaff: string; dedicatedAdmin: boolean; fundedProjects3y: string;
  reportingExperience: string; annualBudget: string; euProject: boolean;
};

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
      <label>Persone stabili
        <select name="stable_staff" value={a.stableStaff}
          onChange={(e) => setA({ ...a, stableStaff: e.target.value })}>
          <option value="">— seleziona —</option>
          {STAFF.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>
      <label>
        <input name="dedicated_admin" type="checkbox" checked={a.dedicatedAdmin}
          onChange={(e) => setA({ ...a, dedicatedAdmin: e.target.checked })} />
        {" "}Persona dedicata all'amministrazione
      </label>
      <label>Progetti finanziati (ultimi 3 anni)
        <select name="funded_projects_3y" value={a.fundedProjects3y}
          onChange={(e) => setA({ ...a, fundedProjects3y: e.target.value })}>
          <option value="">— seleziona —</option>
          {FUNDED.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>
      <label>Esperienza di rendicontazione
        <select name="reporting_experience" value={a.reportingExperience}
          onChange={(e) => setA({ ...a, reportingExperience: e.target.value })}>
          <option value="">— seleziona —</option>
          {REPORT.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>
      <label>Budget annuale
        <select name="annual_budget" value={a.annualBudget}
          onChange={(e) => setA({ ...a, annualBudget: e.target.value })}>
          <option value="">— seleziona —</option>
          {BUDGET.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>
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
