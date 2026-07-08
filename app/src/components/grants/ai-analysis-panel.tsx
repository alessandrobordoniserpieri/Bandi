"use client";
import { useState } from "react";
import type { GrantAnalysis } from "@/lib/ai/analyze-grant";

const DISCLAIMER = "Analisi generata da AI: verifica sempre il testo ufficiale del bando.";

const SECTIONS: [keyof GrantAnalysis, string][] = [
  ["puntiDiForza", "Punti di forza"],
  ["rischi", "Rischi"],
  ["suggerimenti", "Suggerimenti per la candidatura"],
  ["passiSuccessivi", "Passi successivi"],
];

// "Analisi AI approfondita" on the grant detail: on demand, with loading state, Italian
// errors, and the mandatory AI disclaimer (§8). Only zod-validated content is rendered.
export function AIAnalysisPanel({ grantId }: { grantId: string }) {
  const [analysis, setAnalysis] = useState<GrantAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ grantId }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(typeof body.error === "string" ? body.error : "Analisi non riuscita. Riprova.");
      } else {
        setAnalysis(body.analysis as GrantAnalysis);
      }
    } catch {
      setError("Analisi non riuscita. Riprova.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section>
      <button type="button" onClick={run} disabled={loading}>
        {loading ? "Analisi in corso…" : "Analisi AI approfondita"}
      </button>
      {error && <p role="alert">{error}</p>}
      {analysis && (
        <div>
          <p><em>{DISCLAIMER}</em></p>
          {SECTIONS.map(([key, title]) =>
            analysis[key].length > 0 ? (
              <div key={key}>
                <h3>{title}</h3>
                <ul>{analysis[key].map((line, i) => <li key={i}>{line}</li>)}</ul>
              </div>
            ) : null,
          )}
        </div>
      )}
    </section>
  );
}
