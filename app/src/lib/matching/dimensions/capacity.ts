import type {
  CapacityAnswers, CapacityLevel, EntityProfile, Grant, DimensionScore,
} from "../types";
import { CAPACITY_MATRIX, WEIGHTS, NEUTRAL } from "../constants";

const STAFF = { "0-2": 0, "3-10": 1, "11-30": 2, "30+": 3 } as const;
const FUNDED = { "0": 0, "1-2": 1, "3-5": 2, "5+": 3 } as const;
const REPORT = { mai: 0, qualche_volta: 1, regolarmente: 2 } as const;
const BUDGET = { "<20k": 0, "20-100k": 1, "100-500k": 2, ">500k": 3 } as const;

export function calculateCapacity(a: CapacityAnswers | null): CapacityLevel | null {
  if (!a) return null;
  const points =
    STAFF[a.stableStaff] +
    (a.dedicatedAdmin ? 2 : 0) +
    FUNDED[a.fundedProjects3y] +
    REPORT[a.reportingExperience] +
    BUDGET[a.annualBudget] +
    (a.euProject ? 2 : 0);
  if (points <= 4) return "Bassa";
  if (points <= 9) return "Media";
  return "Alta";
}

export function scoreCapacity(profile: EntityProfile, grant: Grant): DimensionScore {
  const max = WEIGHTS.capacity;
  const level = calculateCapacity(profile.capacity);
  if (level === null || grant.complexity == null) {
    return { value: NEUTRAL.capacity, max, note: "capacità o complessità non disponibili" };
  }
  const value = CAPACITY_MATRIX[level][grant.complexity];
  return { value, max, note: `capacità ${level} vs complessità ${grant.complexity}` };
}
