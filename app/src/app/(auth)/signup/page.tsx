"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signUp, type AuthState } from "../actions";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";

export default function SignupPage() {
  const [state, action, pending] = useActionState<AuthState, FormData>(signUp, undefined);
  return (
    <AuthShell statement="Il tuo ente, confrontato con bandi pubblici e privati su sei dimensioni di compatibilità.">
      <h1>Registra il tuo ente</h1>
      <p className="auth-lede">Crea uno spazio Combacia per la tua organizzazione.</p>
      <form action={action}>
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="new-password" required minLength={6} />
        {state && "error" in state && <p role="alert" className="form-feedback" data-type="error">{state.error}</p>}
        {state && "message" in state && <p role="status" className="form-feedback" data-type="success">{state.message}</p>}
        <Button type="submit" className="w-full" disabled={pending}>{pending ? "Registrazione…" : "Registrati"}</Button>
      </form>
      <p className="auth-footer">Hai già un account? <Link href="/login">Accedi</Link></p>
    </AuthShell>
  );
}
