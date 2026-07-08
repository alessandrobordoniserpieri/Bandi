"use client";
import { useState } from "react";
import Link from "next/link";
import type { ExtractedGrant } from "bandi-scraper";

type Phase =
  | { step: "closed" }
  | { step: "input" }
  | { step: "loading" }
  | { step: "preview"; grant: ExtractedGrant }
  | { step: "exists"; grantId: string; title: string }
  | { step: "created"; grantId: string; title: string }
  | { step: "error"; message: string };

// "Segnala un bando" (§4.4): paste a URL → the AI structures it into the 16 fields → the user
// confirms the preview → the grant is inserted and becomes available to everyone.
export function SubmitUrlDialog() {
  const [phase, setPhase] = useState<Phase>({ step: "closed" });
  const [url, setUrl] = useState("");

  async function post(payload: unknown): Promise<{ ok: boolean; body: Record<string, unknown> }> {
    const res = await fetch("/api/grants/submit-url", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    return { ok: res.ok, body: await res.json() };
  }

  async function preview() {
    setPhase({ step: "loading" });
    try {
      const { ok, body } = await post({ action: "preview", url });
      if (!ok) {
        setPhase({ step: "error", message: String(body.error ?? "Errore. Riprova.") });
      } else if (body.status === "exists") {
        setPhase({ step: "exists", grantId: String(body.grantId), title: String(body.title) });
      } else if (body.status === "not_a_grant") {
        setPhase({ step: "error", message: "Non sembra un bando: nessun dato estratto da questa pagina." });
      } else {
        setPhase({ step: "preview", grant: body.grant as ExtractedGrant });
      }
    } catch {
      setPhase({ step: "error", message: "Errore di rete. Riprova." });
    }
  }

  async function confirm(grant: ExtractedGrant) {
    setPhase({ step: "loading" });
    try {
      const { ok, body } = await post({ action: "confirm", grant });
      if (!ok) {
        setPhase({ step: "error", message: String(body.error ?? "Errore. Riprova.") });
      } else if (body.status === "exists") {
        setPhase({ step: "exists", grantId: String(body.grantId), title: String(body.title) });
      } else {
        setPhase({ step: "created", grantId: String(body.grantId), title: String(body.title) });
      }
    } catch {
      setPhase({ step: "error", message: "Errore di rete. Riprova." });
    }
  }

  if (phase.step === "closed") {
    return (
      <button type="button" onClick={() => setPhase({ step: "input" })}>Segnala un bando</button>
    );
  }

  return (
    <section aria-label="Segnala un bando">
      <h2>Segnala un bando</h2>

      {(phase.step === "input" || phase.step === "error") && (
        <div>
          {phase.step === "error" && <p role="alert">{phase.message}</p>}
          <input
            type="url"
            value={url}
            placeholder="https://…"
            onChange={(e) => setUrl(e.target.value)}
          />
          <button type="button" onClick={preview} disabled={!url}>Analizza</button>
        </div>
      )}

      {phase.step === "loading" && <p>Analisi della pagina in corso…</p>}

      {phase.step === "preview" && (
        <div>
          <p>Verifica i dati estratti prima di confermare:</p>
          <ul>
            <li><strong>{phase.grant.title}</strong></li>
            <li>Scadenza: {phase.grant.deadline ?? "n/d"}</li>
            <li>Importo: {phase.grant.amount != null ? `€ ${phase.grant.amount.toLocaleString("it-IT")}` : "n/d"}</li>
            <li>Temi: {phase.grant.tags.join(", ") || "n/d"}</li>
            <li>Forme ammesse: {phase.grant.eligibleTypes.join(", ") || "n/d"}</li>
          </ul>
          <button type="button" onClick={() => confirm(phase.grant)}>Conferma e pubblica</button>{" "}
          <button type="button" onClick={() => setPhase({ step: "input" })}>Annulla</button>
        </div>
      )}

      {phase.step === "exists" && (
        <p>
          Questo bando è già presente:{" "}
          <Link href={`/bandi/${phase.grantId}`}>{phase.title}</Link>
        </p>
      )}

      {phase.step === "created" && (
        <p>
          Bando pubblicato! <Link href={`/bandi/${phase.grantId}`}>{phase.title}</Link>
        </p>
      )}

      <button type="button" onClick={() => { setPhase({ step: "closed" }); setUrl(""); }}>Chiudi</button>
    </section>
  );
}
