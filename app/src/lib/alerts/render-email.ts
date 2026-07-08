// app/src/lib/alerts/render-email.ts
// Italian HTML email for the weekly digest. Inline styles only (email clients strip <style>).
import type { Digest, DigestItem } from "./build-digest";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

function itemCard(item: DigestItem, appUrl: string): string {
  const deadline = item.deadline ? `Scadenza: ${escapeHtml(item.deadline)}` : "Senza scadenza";
  const provider = item.providerName ? escapeHtml(item.providerName) : "Erogatore non indicato";
  return [
    `<div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin:0 0 12px">`,
    `<div style="font-weight:600;font-size:16px">`,
    `<a href="${appUrl}/bandi/${encodeURIComponent(item.grantId)}" style="color:#111827;text-decoration:none">${escapeHtml(item.title)}</a>`,
    `</div>`,
    `<div style="color:#6b7280;font-size:13px;margin-top:4px">${provider}</div>`,
    `<div style="font-size:13px;margin-top:6px">Compatibilità <strong>${item.score}</strong>/100 · ${escapeHtml(item.verdict)} · ${deadline}</div>`,
    `</div>`,
  ].join("");
}

export interface RenderedEmail {
  subject: string;
  html: string;
}

export function renderDigestEmail(digest: Digest, appUrl: string): RenderedEmail {
  const n = digest.items.length;
  const subject = n === 1 ? "1 nuovo bando per te" : `${n} nuovi bandi per te`;
  const html = [
    `<div style="font-family:system-ui,Arial,sans-serif;max-width:600px;margin:0 auto;color:#111827">`,
    `<h1 style="font-size:20px">BANDI-SCANNER — Nuovi bandi della settimana</h1>`,
    `<p style="color:#374151">Bandi con compatibilità almeno ${digest.threshold}/100 con il tuo profilo:</p>`,
    digest.items.map((it) => itemCard(it, appUrl)).join(""),
    `<p style="color:#6b7280;font-size:12px;margin-top:16px">`,
    `Ricevi questa email perché hai attivato il digest settimanale. `,
    `<a href="${appUrl}/profilo" style="color:#2563eb">Gestisci le preferenze</a>.`,
    `</p>`,
    `</div>`,
  ].join("");
  return { subject, html };
}
