"use client";
import { useRouter } from "next/navigation";
import { serializeFilters, type Filters, type SortKey } from "@/lib/grants/filters";
import type { Verdict, GeoScope } from "@/lib/matching";

const VERDICTS: Verdict[] = ["Candidabile", "Da preparare", "Da valutare", "Bassa priorità", "Non compatibile"];
const GEOS: GeoScope[] = ["comunale", "provinciale", "regionale", "nazionale", "europeo"];

export function FilterBar({ filters, sort }: { filters: Filters; sort: SortKey }) {
  const router = useRouter();

  function go(next: Filters, nextSort: SortKey) {
    const qs = serializeFilters(next, nextSort);
    router.push(qs ? `?${qs}` : "?");
  }
  function toggle<T>(arr: T[] | undefined, v: T): T[] {
    const set = new Set(arr ?? []);
    set.has(v) ? set.delete(v) : set.add(v);
    return [...set];
  }

  return (
    <div className="filter-bar">
      <label>Ordina per{" "}
        <select value={sort} onChange={(e) => go(filters, e.target.value as SortKey)}>
          <option value="score">Compatibilità</option>
          <option value="deadline">Scadenza</option>
          <option value="amount">Importo</option>
        </select>
      </label>
      <label className="filter-chip">
        <input type="checkbox" checked={!!filters.onlyCandidabili}
          onChange={(e) => go({ ...filters, onlyCandidabili: e.target.checked || undefined }, sort)} />
        Solo candidabili
      </label>
      <fieldset>
        <legend>Verdetto</legend>
        {VERDICTS.map((v) => (
          <label key={v} className="filter-chip">
            <input type="checkbox" checked={filters.verdetti?.includes(v) ?? false}
              onChange={() => {
                const verdetti = toggle(filters.verdetti, v);
                go({ ...filters, verdetti: verdetti.length ? verdetti : undefined }, sort);
              }} />
            {v}
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Ambito</legend>
        {GEOS.map((g) => (
          <label key={g} className="filter-chip">
            <input type="checkbox" checked={filters.geoScopes?.includes(g) ?? false}
              onChange={() => {
                const geoScopes = toggle(filters.geoScopes, g);
                go({ ...filters, geoScopes: geoScopes.length ? geoScopes : undefined }, sort);
              }} />
            {g}
          </label>
        ))}
      </fieldset>
      <label>Scadenza entro (giorni){" "}
        <input type="number" defaultValue={filters.maxDeadlineDays ?? ""}
          onChange={(e) => go({ ...filters, maxDeadlineDays: e.target.value ? Number(e.target.value) : undefined }, sort)} />
      </label>
      <label>Importo min{" "}
        <input type="number" defaultValue={filters.minAmount ?? ""}
          onChange={(e) => go({ ...filters, minAmount: e.target.value ? Number(e.target.value) : undefined }, sort)} />
      </label>
      <label>Importo max{" "}
        <input type="number" defaultValue={filters.maxAmount ?? ""}
          onChange={(e) => go({ ...filters, maxAmount: e.target.value ? Number(e.target.value) : undefined }, sort)} />
      </label>
    </div>
  );
}
