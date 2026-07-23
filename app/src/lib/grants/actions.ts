"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { DENSITY_COOKIE, serializeDensityCookie, type DensityMode } from "./view-density";

export async function setDensity(mode: DensityMode): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(DENSITY_COOKIE, serializeDensityCookie(mode), {
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });
  revalidatePath("/");
}
