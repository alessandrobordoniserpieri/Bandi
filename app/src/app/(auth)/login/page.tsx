"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signIn, type AuthState } from "../actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState<AuthState, FormData>(signIn, undefined);
  return (
    <main className="auth-card">
      <h1>Accedi</h1>
      <form action={action}>
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
        {state && "error" in state && <p role="alert" className="form-feedback" data-type="error">{state.error}</p>}
        <button type="submit" className="btn-primary" disabled={pending}>{pending ? "Accesso…" : "Accedi"}</button>
      </form>
      <p className="auth-footer">Non hai un account? <Link href="/signup">Registra il tuo ente</Link></p>
    </main>
  );
}
