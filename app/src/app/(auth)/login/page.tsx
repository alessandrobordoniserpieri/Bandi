"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signIn, type AuthState } from "../actions";
import { AuthShell } from "@/components/auth/auth-shell";

export default function LoginPage() {
  const [state, action, pending] = useActionState<AuthState, FormData>(signIn, undefined);
  return (
    <AuthShell statement="Il tuo ente, confrontato con bandi pubblici e privati su sei dimensioni di compatibilità.">
      <h1>Accedi</h1>
      <p className="auth-lede">Entra nel tuo spazio BANDI-SCANNER.</p>
      <form action={action}>
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
        <div>
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required />
          <Link href="/recupera-password" className="auth-recover-link">Password dimenticata?</Link>
        </div>
        {state && "error" in state && <p role="alert" className="form-feedback" data-type="error">{state.error}</p>}
        <button type="submit" className="btn-primary" disabled={pending}>{pending ? "Accesso…" : "Accedi"}</button>
      </form>
      <p className="auth-footer">Non hai un account? <Link href="/signup">Registra il tuo ente</Link></p>
    </AuthShell>
  );
}
