"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordReset, type AuthState } from "../actions";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";

export default function RecuperaPasswordPage() {
  const [state, action, pending] = useActionState<AuthState, FormData>(requestPasswordReset, undefined);
  return (
    <AuthShell statement="Il tuo ente, confrontato con bandi pubblici e privati su sei dimensioni di compatibilità.">
      <h1>Recupera password</h1>
      <p className="auth-lede">Inserisci l&apos;email del tuo account: ti invieremo un link per reimpostarla.</p>
      <form action={action}>
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
        {state && "error" in state && <p role="alert" className="form-feedback" data-type="error">{state.error}</p>}
        {state && "message" in state && <p role="status" className="form-feedback" data-type="success">{state.message}</p>}
        <Button type="submit" className="w-full" disabled={pending}>{pending ? "Invio…" : "Invia link di recupero"}</Button>
      </form>
      <p className="auth-footer"><Link href="/login">Torna al login</Link></p>
    </AuthShell>
  );
}
