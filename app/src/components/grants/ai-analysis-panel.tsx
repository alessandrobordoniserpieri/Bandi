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
    <section className="ai-panel">
      <div className="ai-panel-header">
        <button type="button" className="btn-primary" onClick={run} disabled={loading}>
          {loading ? "Analisi in corso…" : "Analisi AI approfondita"}
        </button>
      </div>
      {error && <p role="alert" className="form-feedback" data-type="error" style={{ padding: "0.5rem 1rem" }}>{error}</p>}
      {analysis && (
        <>
          <p className="ai-panel-disclaimer">{DISCLAIMER}</p>
          <div className="ai-panel-sections">
            {SECTIONS.map(([key, title]) =>
              analysis[key].length > 0 ? (
                <div key={key}>
                  <h3>{title}</h3>
                  <ul>{analysis[key].map((line, i) => <li key={i}>{line}</li>)}</ul>
                </div>
              ) : null,
            )}
          </div>
        </>
      )}
    </section>
  );
}
