"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface CreditsBalance {
  total: number;
}

const SUGGESTED_PROMPTS = [
  "Riassumi i requisiti principali in poche righe",
  "Il mio ente può candidarsi?",
  "Quali documenti devo preparare?",
];

export function StrongChatPanel({ grantId }: { grantId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [credits, setCredits] = useState<CreditsBalance | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const refreshCredits = useCallback(() => {
    fetch("/api/ai/credits")
      .then((res) => res.json())
      .then((body) => { if (typeof body.total === "number") setCredits(body); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch(`/api/ai/strong/chat?grantId=${encodeURIComponent(grantId)}`)
      .then((res) => res.json())
      .then((body) => { if (Array.isArray(body.messages)) setMessages(body.messages); })
      .finally(() => setLoaded(true));
    refreshCredits();
  }, [grantId, refreshCredits]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || sending) return;
    setSending(true);
    setError(null);
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setInput("");
    try {
      const res = await fetch("/api/ai/strong/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ grantId, message: question }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(typeof body.error === "string" ? body.error : "Risposta non riuscita. Riprova.");
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: body.reply as string }]);
        refreshCredits(); // a credit was just spent
      }
    } catch {
      setError("Risposta non riuscita. Riprova.");
    } finally {
      setSending(false);
    }
  }

  const outOfCredits = credits !== null && credits.total <= 0;

  return (
    <div className="strong-chat">
      <p className="strong-chat-note">La chat tiene conto del tuo profilo ente.</p>
      {credits && (
        <p className="strong-chat-credits" data-empty={outOfCredits}>
          {outOfCredits
            ? "Crediti chat esauriti questo mese — si ricaricano il mese prossimo."
            : `${credits.total} crediti chat disponibili questo mese`}
        </p>
      )}

      {loaded && messages.length === 0 && (
        <div className="strong-chat-suggestions">
          {SUGGESTED_PROMPTS.map((p) => (
            <button
              key={p}
              type="button"
              className="strong-chat-suggestion"
              onClick={() => send(p)}
              disabled={sending || outOfCredits}
            >
              {p}
            </button>
          ))}
        </div>
      )}

      <div className="strong-chat-messages">
        {messages.map((m, i) => (
          <div key={i} className="strong-chat-message" data-role={m.role}>
            <p>{m.content}</p>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {error && <p role="alert" className="form-feedback" data-type="error">{error}</p>}

      <form
        className="strong-chat-form"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Fai una domanda su questo bando…"
          rows={2}
          disabled={sending || outOfCredits}
        />
        <Button type="submit" disabled={sending || outOfCredits || !input.trim()}>
          {sending ? "Invio…" : "Invia"}
        </Button>
      </form>
    </div>
  );
}
