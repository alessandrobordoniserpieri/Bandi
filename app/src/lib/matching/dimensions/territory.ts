import type { EntityProfile, Grant, DimensionScore } from "../types";
import { WEIGHTS, NEUTRAL, regionForProvince } from "../constants";

export function scoreTerritory(profile: EntityProfile, grant: Grant): DimensionScore {
  const max = WEIGHTS.territory;

  // No structured territorial data → neutral / uncertainty.
  if (!grant.geoScope) {
    return grant.area
      ? { value: 5, max, note: "ambito territoriale incerto" }
      : { value: NEUTRAL.territory, max, note: "il bando non specifica il territorio" };
  }

  if (grant.geoScope === "nazionale" || grant.geoScope === "europeo") {
    return { value: max, max, note: `bando ${grant.geoScope}, valido per tutti` };
  }

  const entityProvinces = [profile.province, ...(profile.operatingProvinces ?? [])].filter(Boolean);
  const entityRegions = new Set(entityProvinces.map(regionForProvince).filter(Boolean) as string[]);

  if (grant.geoScope === "regionale") {
    const match = grant.area != null && entityRegions.has(grant.area);
    return match
      ? { value: max, max, note: "stessa regione dell'ente" }
      : { value: 0, max, note: "regione diversa" };
  }

  // comunale | provinciale → match by province code
  const match = grant.area != null && entityProvinces.includes(grant.area);
  return match
    ? { value: max, max, note: "stessa provincia dell'ente" }
    : { value: 0, max, note: "provincia diversa" };
}
