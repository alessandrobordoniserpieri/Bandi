import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Sidebar } from "../sidebar";

let mockPathname = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

async function noopSignOut(): Promise<void> {}

function render(pathname: string) {
  mockPathname = pathname;
  return renderToStaticMarkup(
    <Sidebar showNav credits={12} signOutAction={noopSignOut} />,
  );
}

function anchorFor(html: string, label: string): string {
  const idx = html.indexOf(label);
  const start = html.lastIndexOf("<a", idx);
  const end = html.indexOf("</a>", idx) + "</a>".length;
  return html.slice(start, end);
}

describe("Sidebar", () => {
  it("exposes a labelled <nav> navigation landmark", () => {
    const html = render("/");
    expect(html).toContain("<nav");
    expect(html).toContain("aria-label");
  });

  it("renders the brand wordmark placeholder", () => {
    expect(render("/")).toContain("BANDI-SCANNER");
  });

  it("renders both group headings", () => {
    const html = render("/");
    expect(html).toContain("Bandi");
    expect(html).toContain("Il mio ente");
  });

  it("renders every navigation entry", () => {
    const html = render("/");
    for (const label of [
      "Esplora bandi",
      "I miei bandi",
      "Scadenze",
      "Assistente",
      "Profilo ente",
      "Crediti &amp; piano",
      "Notifiche",
      "Impostazioni",
    ]) {
      expect(html).toContain(label);
    }
  });

  it("never shows the word 'Dashboard'", () => {
    expect(render("/")).not.toMatch(/dashboard/i);
  });

  it("marks the active route with aria-current=page and nothing else", () => {
    const html = render("/i-miei-bandi");
    expect(anchorFor(html, "I miei bandi")).toContain('aria-current="page"');
    expect(anchorFor(html, "Esplora bandi")).not.toContain("aria-current");
  });

  it("marks the home entry active on '/'", () => {
    expect(anchorFor(render("/"), "Esplora bandi")).toContain(
      'aria-current="page"',
    );
  });

  it("pins a credits widget showing the balance and a manage link to /crediti", () => {
    const html = render("/");
    expect(html).toContain("Crediti");
    expect(html).toContain("12");
    const manage = anchorFor(html, "Gestisci");
    expect(manage).toContain('href="/crediti"');
  });

  it("keeps a logout control", () => {
    expect(render("/")).toContain("Esci");
  });

  it("provides a mobile drawer toggle that is collapsed by default", () => {
    const html = render("/");
    expect(html).toMatch(/aria-expanded="false"/);
    expect(html).toContain("aria-controls");
  });

  it("omits the navigation groups when showNav is false (pre-onboarding)", () => {
    const html = renderToStaticMarkup(
      <Sidebar showNav={false} credits={0} signOutAction={noopSignOut} />,
    );
    expect(html).toContain("BANDI-SCANNER");
    expect(html).toContain("Esci");
    expect(html).not.toContain("I miei bandi");
  });
});
