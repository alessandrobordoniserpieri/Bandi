import { describe, it, expect, vi, beforeEach } from "vitest";

const signInWithPassword = vi.fn();
const signUp = vi.fn();
const signOut = vi.fn();
const getUser = vi.fn();
const deleteUser = vi.fn();
const redirect = vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); });

vi.mock("next/navigation", () => ({ redirect: (u: string) => redirect(u) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signInWithPassword, signUp, signOut, getUser } }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ auth: { admin: { deleteUser } } }),
}));

import { signIn, signUp as signUpAction, signOut as signOutAction, deleteAccount } from "../actions";

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  Object.entries(o).forEach(([k, v]) => f.set(k, v));
  return f;
};

beforeEach(() => vi.clearAllMocks());

describe("signIn", () => {
  it("missing fields → Italian error, no Supabase call", async () => {
    const res = await signIn(undefined, fd({ email: "", password: "" }));
    expect(res).toEqual({ error: "Inserisci email e password." });
    expect(signInWithPassword).not.toHaveBeenCalled();
  });
  it("wrong credentials → Italian translation", async () => {
    signInWithPassword.mockResolvedValue({ error: { message: "Invalid login credentials" } });
    const res = await signIn(undefined, fd({ email: "a@b.it", password: "x" }));
    expect(res).toEqual({ error: "Email o password non corretti." });
  });
  it("success → redirect to /", async () => {
    signInWithPassword.mockResolvedValue({ error: null });
    await expect(signIn(undefined, fd({ email: "a@b.it", password: "secret" }))).rejects.toThrow("REDIRECT:/");
  });
});

describe("signUp", () => {
  it("short password → Italian error", async () => {
    const res = await signUpAction(undefined, fd({ email: "a@b.it", password: "123" }));
    expect(res).toEqual({ error: "La password deve avere almeno 6 caratteri." });
    expect(signUp).not.toHaveBeenCalled();
  });
  it("duplicate → Italian translation", async () => {
    signUp.mockResolvedValue({ error: { message: "User already registered" } });
    const res = await signUpAction(undefined, fd({ email: "a@b.it", password: "secret1" }));
    expect(res).toEqual({ error: "Esiste già un account con questa email." });
  });
  it("success → redirect to /onboarding", async () => {
    signUp.mockResolvedValue({ error: null });
    await expect(signUpAction(undefined, fd({ email: "a@b.it", password: "secret1" }))).rejects.toThrow("REDIRECT:/onboarding");
  });
});

describe("deleteAccount", () => {
  it("deletes the auth user then redirects home", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    deleteUser.mockResolvedValue({ error: null });
    signOut.mockResolvedValue({ error: null });
    await expect(deleteAccount()).rejects.toThrow("REDIRECT:/");
    expect(deleteUser).toHaveBeenCalledWith("u1");
  });
});
