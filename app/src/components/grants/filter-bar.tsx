"use client";
import { useRouter } from "next/navigation";
import { serializeFilters, type Filters, type SortKey } from "@/lib/grants/filters";
import type { Verdict, GeoScope } from "@/lib/matching";
import type { DensityMode } from "@/lib/grants/view-density";
import { DensityToggle } from "./density-toggle";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const VERDICTS: Verdict[] = ["Candidabile", "Da preparare", "Da valutare", "Bassa priorità", "Non compatibile"];
const GEOS: GeoScope[] = ["comunale", "provinciale", "regionale", "nazionale", "europeo"];

export function FilterBar({
  filters,
  sort,
  density,
}: {
  filters: Filters;
  sort: SortKey;
  density: DensityMode;
}) {
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

  const hasActiveSecondaryFilters = Boolean(
    filters.verdetti?.length || filters.geoScopes?.length ||
    filters.maxDeadlineDays != null || filters.minAmount != null || filters.maxAmount != null,
  );

  return (
    <div className="filter-bar">
      <div className="form-group filter-bar-sort">
        <label htmlFor="sort-select">Ordina per</label>
        <Select value={sort} onValueChange={(v) => go(filters, v as SortKey)}>
          <SelectTrigger id="sort-select" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="score">Compatibilità</SelectItem>
            <SelectItem value="deadline">Scadenza</SelectItem>
            <SelectItem value="amount">Importo</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <label className="filter-chip">
        <input type="checkbox" checked={!!filters.onlyCandidabili}
          onChange={(e) => go({ ...filters, onlyCandidabili: e.target.checked || undefined }, sort)} />
        Solo candidabili
      </label>
      <DensityToggle current={density} />
      <details className="filter-bar-more" open={hasActiveSecondaryFilters}>
        <summary>Altri filtri</summary>
        <div className="filter-bar-more-content">
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
      </details>
    </div>
  );
}
