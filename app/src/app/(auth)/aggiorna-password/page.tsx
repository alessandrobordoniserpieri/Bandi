"use client";

import { useActionState } from "react";
import { updatePassword, type AuthState } from "../actions";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";

export default function AggiornaPasswordPage() {
  const [state, action, pending] = useActionState<AuthState, FormData>(updatePassword, undefined);
  return (
    <AuthShell statement="Il tuo ente, confrontato con bandi pubblici e privati su sei dimensioni di compatibilità.">
      <h1>Imposta una nuova password</h1>
      <p className="auth-lede">Scegli la nuova password per il tuo account.</p>
      <form action={action}>
        <label htmlFor="password">Nuova password</label>
        <input id="password" name="password" type="password" autoComplete="new-password" required minLength={6} />
        {state && "error" in state && <p role="alert" className="form-feedback" data-type="error">{state.error}</p>}
        <Button type="submit" className="w-full" disabled={pending}>{pending ? "Salvataggio…" : "Salva nuova password"}</Button>
      </form>
    </AuthShell>
  );
}
