"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type AuthState = { error: string } | { message: string } | undefined;

// Not exported on purpose: a "use server" module may only export async Server
// Actions (Next.js build rule). This sync helper stays module-private.
function italianAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "Email o password non corretti.";
  if (m.includes("already registered")) return "Esiste già un account con questa email.";
  if (m.includes("password should be at least")) return "La password deve avere almeno 6 caratteri.";
  if (m.includes("unable to validate email") || m.includes("invalid email"))
    return "Inserisci un indirizzo email valido.";
  if (m.includes("email not confirmed")) return "Conferma la tua email prima di accedere.";
  return "Si è verificato un errore. Riprova.";
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Inserisci email e password." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: italianAuthError(error.message) };
  redirect("/");
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email.includes("@")) return { error: "Inserisci un indirizzo email valido." };
  if (password.length < 6) return { error: "La password deve avere almeno 6 caratteri." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return { error: italianAuthError(error.message) };
  if (!data.session) {
    // Email confirmation is enabled: no session yet. Tell the user to confirm.
    return { message: "Ti abbiamo inviato un'email di conferma. Confermala e poi accedi." };
  }
  redirect("/onboarding");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function deleteAccount(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // service_role deletion cascades to profiles/saved_grants/user_settings via FK on delete cascade
  const admin = createAdminClient();
  await admin.auth.admin.deleteUser(user.id);
  await supabase.auth.signOut();
  redirect("/");
}
