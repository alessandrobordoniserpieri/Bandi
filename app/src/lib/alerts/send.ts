// app/src/lib/alerts/send.ts
// Email sender seam so the digest batch runs against a fake in tests (no network, no key).
export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
}

export interface EmailSender {
  send(msg: EmailMessage): Promise<void>;
}

export class FakeEmailSender implements EmailSender {
  readonly sent: EmailMessage[] = [];
  async send(msg: EmailMessage): Promise<void> {
    this.sent.push(msg);
  }
}

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

// Resend adapter (https://resend.com). from should be a verified sender for the domain.
export class ResendSender implements EmailSender {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchImpl: FetchLike = fetch as unknown as FetchLike,
  ) {}

  async send(msg: EmailMessage): Promise<void> {
    const res = await this.fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from: this.from, to: msg.to, subject: msg.subject, html: msg.html }),
    });
    if (!res.ok) {
      throw new Error(`Resend HTTP ${res.status}: ${await res.text().catch(() => "")}`.trim());
    }
  }
}

export function getSender(env: Record<string, string | undefined> = process.env): EmailSender {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY mancante");
  return new ResendSender(apiKey, env.DIGEST_FROM_EMAIL ?? "BANDI-SCANNER <noreply@bandi-scanner.it>");
}
