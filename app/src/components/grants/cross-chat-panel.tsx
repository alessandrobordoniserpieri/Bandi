"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

interface Source {
  grantId: string;
  grantTitle: string;
}
interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
}

const SUGGESTED_PROMPTS = [
  "Confronta i miei bandi salvati: quale è il più adatto al mio ente?",
  "Tra i miei bandi, quali parlano di inclusione sociale?",
  "Quali scadenze ho più vicine tra i bandi salvati?",
];

export function CrossChatPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/ai/strong/cross-chat")
      .then((res) => res.json())
      .then((body) => { if (Array.isArray(body.messages)) setMessages(body.messages); })
      .finally(() => setLoaded(true));
  }, []);

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
      const res = await fetch("/api/ai/strong/cross-chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: question }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(typeof body.error === "string" ? body.error : "Risposta non riuscita. Riprova.");
      } else {
        setMessages((prev) => [...prev, {
          role: "assistant",
          content: body.reply as string,
          sources: Array.isArray(body.sources) ? (body.sources as Source[]) : [],
        }]);
      }
    } catch {
      setError("Risposta non riuscita. Riprova.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="strong-chat cross-chat-panel">
      <p className="strong-chat-note">
        L&apos;assistente ragiona sui tuoi <strong>bandi salvati</strong> e tiene conto del tuo profilo ente.
      </p>

      {loaded && messages.length === 0 && (
        <div className="strong-chat-suggestions">
          {SUGGESTED_PROMPTS.map((p) => (
            <button key={p} type="button" className="strong-chat-suggestion" onClick={() => send(p)} disabled={sending}>
              {p}
            </button>
          ))}
        </div>
      )}

      <div className="strong-chat-messages">
        {messages.map((m, i) => (
          <div key={i} className="strong-chat-message" data-role={m.role}>
            <p>{m.content}</p>
            {m.role === "assistant" && m.sources && m.sources.length > 0 && (
              <p className="cross-chat-sources">
                Fonti:{" "}
                {m.sources.map((s, j) => (
                  <span key={s.grantId}>
                    {j > 0 && ", "}
                    <a href={`/bandi/${s.grantId}`}>{s.grantTitle}</a>
                  </span>
                ))}
              </p>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {error && <p role="alert" className="form-feedback" data-type="error">{error}</p>}

      <form className="strong-chat-form" onSubmit={(e) => { e.preventDefault(); send(input); }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Fai una domanda sui tuoi bandi salvati…"
          rows={2}
          disabled={sending}
        />
        <Button type="submit" disabled={sending || !input.trim()}>
          {sending ? "Invio…" : "Invia"}
        </Button>
      </form>
    </div>
  );
}
