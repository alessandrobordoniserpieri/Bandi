"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signUp, type AuthState } from "../actions";

export default function SignupPage() {
  const [state, action, pending] = useActionState<AuthState, FormData>(signUp, undefined);
  return (
    <main style={{ maxWidth: 380, margin: "4rem auto", padding: "0 1rem" }}>
      <h1>Registra il tuo ente</h1>
      <form action={action}>
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="new-password" required minLength={6} />
        {state && "error" in state && <p role="alert">{state.error}</p>}
        {state && "message" in state && <p role="status">{state.message}</p>}
        <button type="submit" disabled={pending}>{pending ? "Registrazione…" : "Registrati"}</button>
      </form>
      <p>Hai già un account? <Link href="/login">Accedi</Link></p>
    </main>
  );
}
