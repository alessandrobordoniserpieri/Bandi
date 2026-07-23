import { describe, it, expect, vi, beforeEach } from "vitest";

const insert = vi.fn();
const update = vi.fn();
const eq = vi.fn();
const getUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser },
    from: () => ({
      // `createProfile` reads the row back after insert to compute the honest
      // completion percent (DEC-12); the unfilled sections (capacity, documents,
      // history) are simply absent from the patch, which `profileCompletion`
      // already treats as "not filled" (falsy / empty-array checks).
      insert: (...a: unknown[]) => {
        insert(...a);
        return {
          select: () => ({
            single: async () => ({ data: a[0], error: null }),
          }),
        };
      },
      update: (...a: unknown[]) => { update(...a); return { eq: (...e: unknown[]) => { eq(...e); return { error: null }; } }; },
    }),
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (p: string) => { throw new Error(`REDIRECT:${p}`); },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createProfile, updateProfileSection } from "../actions";

function fd(entries: [string, string][]): FormData {
  const f = new FormData();
  for (const [k, v] of entries) f.append(k, v);
  return f;
}

beforeEach(() => {
  insert.mockClear(); update.mockClear(); eq.mockClear(); getUser.mockClear();
  getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
});

describe("createProfile", () => {
  it("inserts a row (identity/territory/themes/contacts) with derived region", async () => {
    const form = fd([
      ["name", "ASD Test"], ["legal_type", "APS - Associazione di Promozione Sociale"],
      ["province", "MI"], ["themes", "sport"], ["contact_email", "info@asd-test.it"],
    ]);
    const res = await createProfile(undefined, form);
    const inserted = insert.mock.calls[0][0];
    expect(inserted.user_id).toBe("u1");
    expect(inserted.region).toBe("Lombardia");
    expect(inserted.themes).toEqual(["sport"]);
    expect(inserted.contact_email).toBe("info@asd-test.it");
    // DEC-12: no more silent redirect to "/" — the caller shows the honest
    // completion screen (percent + what's still missing) itself.
    expect(res).toEqual({ ok: true, percent: 68 });
  });

  it("contacts is optional: an empty contacts step still creates the profile", async () => {
    const form = fd([
      ["name", "X"], ["legal_type", "ONLUS"], ["province", "MI"], ["themes", "sport"],
    ]);
    const res = await createProfile(undefined, form);
    expect(res).toEqual({ ok: true, percent: 68 });
  });

  it("rejects when the essential themes list is empty", async () => {
    const form = fd([
      ["name", "X"], ["legal_type", "ONLUS"], ["province", "MI"],
    ]);
    const res = await createProfile(undefined, form);
    expect(res && "error" in res).toBe(true);
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects a legal type outside the 62", async () => {
    const form = fd([
      ["name", "X"], ["legal_type", "Fake"], ["province", "MI"], ["themes", "sport"],
    ]);
    const res = await createProfile(undefined, form);
    expect(res && "error" in res).toBe(true);
  });

  it("rejects an invalid contact email", async () => {
    const form = fd([
      ["name", "X"], ["legal_type", "ONLUS"], ["province", "MI"], ["themes", "sport"],
      ["contact_email", "not-an-email"],
    ]);
    const res = await createProfile(undefined, form);
    expect(res && "error" in res).toBe(true);
    expect(insert).not.toHaveBeenCalled();
  });

  it("redirects to /login when there is no user", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const form = fd([
      ["name", "X"], ["legal_type", "ONLUS"], ["province", "MI"], ["themes", "sport"],
    ]);
    await expect(createProfile(undefined, form)).rejects.toThrow(/^REDIRECT:\/login$/);
  });
});

describe("updateProfileSection", () => {
  it("updates territory columns with derived region", async () => {
    const form = fd([["province", "RM"]]);
    const res = await updateProfileSection("territory", undefined, form);
    expect(res).toEqual({ ok: true });
    const patch = update.mock.calls[0][0];
    expect(patch.province).toBe("RM");
    expect(patch.region).toBe("Lazio");
    expect(eq).toHaveBeenCalledWith("user_id", "u1");
  });

  it("rejects an invalid tag in the themes section", async () => {
    const form = fd([["themes", "NotATag"]]);
    const res = await updateProfileSection("themes", undefined, form);
    expect(res && "error" in res).toBe(true);
    expect(update).not.toHaveBeenCalled();
  });

  it("redirects to /login when there is no user", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const form = fd([["province", "RM"]]);
    await expect(updateProfileSection("territory", undefined, form))
      .rejects.toThrow(/^REDIRECT:\/login$/);
    expect(update).not.toHaveBeenCalled();
  });

  it("writes null (not undefined/absent) for cleared optional fields, so supabase-js actually persists the clear", async () => {
    // website/tax_code/founded_year are absent from the FormData (as they
    // would be after the user blanks them out in the UI). Before the fix,
    // `str()` mapped them to `undefined`, and the patch spread `{ ...parsed.data }`
    // carried those `undefined`s through — which supabase-js's `.update()`
    // drops entirely, silently no-oping the clear while still reporting success.
    const form = fd([["name", "X"], ["legal_type", "ONLUS"]]);
    const res = await updateProfileSection("identity", undefined, form);
    expect(res).toEqual({ ok: true });
    const patch = update.mock.calls[0][0];
    expect(patch.website).toBeNull();
    expect(patch.founded_year).toBeNull();
    expect(patch.tax_code).toBeNull();
    expect("website" in patch).toBe(true);
    expect("founded_year" in patch).toBe(true);
  });
});
