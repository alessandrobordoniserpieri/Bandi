"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signIn, type AuthState } from "../actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState<AuthState, FormData>(signIn, undefined);
  return (
    <main style={{ maxWidth: 380, margin: "4rem auto", padding: "0 1rem" }}>
      <h1>Accedi</h1>
      <form action={action}>
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
        {state?.error && <p role="alert">{state.error}</p>}
        <button type="submit" disabled={pending}>{pending ? "Accesso…" : "Accedi"}</button>
      </form>
      <p>Non hai un account? <Link href="/signup">Registra il tuo ente</Link></p>
    </main>
  );
}
