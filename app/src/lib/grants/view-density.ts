export type DensityMode = "card" | "compact";

export const DENSITY_COOKIE = "bandi-density";

export function parseDensityCookie(value: string | undefined): DensityMode {
  return value === "compact" ? "compact" : "card";
}

export function serializeDensityCookie(mode: DensityMode): string {
  return mode;
}
