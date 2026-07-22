"use client";
import { useCallback, useEffect, useState } from "react";
import type { ReadinessState } from "@/lib/ai/document-readiness";
import type { GrantAnalysis } from "@/lib/ai/analyze-grant";
import { Button } from "@/components/ui/button";
import { StrongChatPanel } from "./strong-chat-panel";

const POLL_MS = 9_000;

const SECTIONS: [keyof GrantAnalysis, string][] = [
  ["puntiDiForza", "Punti di forza"],
  ["rischi", "Rischi"],
  ["suggerimenti", "Suggerimenti per la candidatura"],
  ["passiSuccessivi", "Passi successivi"],
];

export function StrongAnalysisPanel({ grantId }: { grantId: string }) {
  const [readiness, setReadiness] = useState<ReadinessState | null>(null);
  const [analysis, setAnalysis] = useState<GrantAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  const fetchStatus = useCallback(async () => {
    const res = await fetch(`/api/ai/strong/status?grantId=${encodeURIComponent(grantId)}`);
    const body = await res.json();
    if (res.ok) setReadiness(body.readiness as ReadinessState);
  }, [grantId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Polling (spec §6, ~8-10s) while the extraction worker is still running.
  useEffect(() => {
    if (readiness !== "preparing") return;
    const id = setInterval(fetchStatus, POLL_MS);
    return () => clearInterval(id);
  }, [readiness, fetchStatus]);

  // Silent upgrade (spec §1): once documents are ready, /api/ai/analyze naturally returns the
  // richer analysis — no separate "strong analyze" endpoint.
  useEffect(() => {
    if (readiness !== "ready" && readiness !== "ready_partial") return;
    let cancelled = false;
    setAnalyzing(true);
    fetch("/api/ai/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ grantId }),
    })
      .then(async (res) => {
        const body = await res.json();
        if (cancelled) return;
        if (res.ok) setAnalysis(body.analysis as GrantAnalysis);
        else setError(typeof body.error === "string" ? body.error : "Analisi non riuscita. Riprova.");
      })
      .catch(() => { if (!cancelled) setError("Analisi non riuscita. Riprova."); })
      .finally(() => { if (!cancelled) setAnalyzing(false); });
    return () => { cancelled = true; };
  }, [readiness, grantId]);

  async function start(force = false) {
    setStarting(true);
    setError(null);
    if (force) {
      setAnalysis(null); // stale rich analysis shouldn't linger while re-extraction runs
    }
    try {
      const res = await fetch("/api/ai/strong/prepare", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ grantId, force }),
      });
      const body = await res.json();
      if (!res.ok) setError(typeof body.error === "string" ? body.error : "Impossibile avviare l'analisi forte.");
      else setReadiness(body.readiness as ReadinessState);
    } catch {
      setError("Impossibile avviare l'analisi forte.");
    } finally {
      setStarting(false);
    }
  }

  // Still loading, or the grant has no PDF attachments at all: nothing to show (see plan's
  // Global Constraints for why no_documents renders nothing rather than a permanent notice).
  if (readiness === null || readiness === "no_documents") return null;

  return (
    <section className="strong-panel">
      <div className="strong-panel-header">
        <h2>Analisi forte</h2>
        <p className="strong-panel-subtitle">
          Analisi basata sul testo reale dei documenti ufficiali del bando, con chat dedicata.
        </p>
      </div>

      {error && <p role="alert" className="form-feedback" data-type="error">{error}</p>}

      {readiness === "not_started" && (
        <Button type="button" onClick={() => start()} disabled={starting}>
          {starting ? "Avvio in corso…" : "Avvia analisi forte"}
        </Button>
      )}

      {readiness === "preparing" && (
        <p className="strong-panel-status">
          Stiamo leggendo i documenti del bando — circa 1 minuto. Puoi restare o tornare più tardi.
        </p>
      )}

      {readiness === "failed_total" && (
        <>
          <p className="strong-panel-status">
            Questo bando non ha documenti leggibili automaticamente.
          </p>
          {/* Escape hatch (spec §7): force a fresh extraction attempt, e.g. after an OCR outage. */}
          <Button type="button" variant="outline" onClick={() => start(true)} disabled={starting}>
            {starting ? "Nuovo tentativo…" : "Ri-analizza"}
          </Button>
        </>
      )}

      {(readiness === "ready" || readiness === "ready_partial") && (
        <>
          {readiness === "ready_partial" && (
            <p className="strong-panel-status">
              Alcuni allegati non erano leggibili automaticamente: procediamo con quanto disponibile.{" "}
              <Button type="button" variant="outline" size="sm" onClick={() => start(true)} disabled={starting}>
                {starting ? "Nuovo tentativo…" : "Ri-analizza"}
              </Button>
            </p>
          )}
          {analyzing && <p className="strong-panel-status">Generazione dell'analisi in corso…</p>}
          {analysis && (
            <div className="ai-panel-sections">
              <p className="strong-panel-badge">Analisi basata sui documenti ufficiali</p>
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
          <StrongChatPanel grantId={grantId} />
        </>
      )}
    </section>
  );
}
