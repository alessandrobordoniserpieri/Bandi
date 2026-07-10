import { describe, it, expect } from "vitest";
import { sanitizeHtml } from "../src/pipeline/sanitize-html";

describe("sanitizeHtml", () => {
  it("removes script tags and their content", () => {
    const html = '<p>Bando</p><script>alert("xss")</script><p>Altro</p>';
    expect(sanitizeHtml(html)).not.toContain("script");
    expect(sanitizeHtml(html)).toContain("Bando");
    expect(sanitizeHtml(html)).toContain("Altro");
  });

  it("removes style tags", () => {
    const html = "<style>.x{color:red}</style><p>Content</p>";
    expect(sanitizeHtml(html)).not.toContain("style");
    expect(sanitizeHtml(html)).toContain("Content");
  });

  it("removes nav, header, footer sections", () => {
    const html = "<nav><a href='/'>Home</a></nav><p>Bando importante</p><footer>Cookie</footer>";
    const result = sanitizeHtml(html);
    expect(result).not.toContain("Home");
    expect(result).not.toContain("Cookie");
    expect(result).toContain("Bando importante");
  });

  it("preserves href on anchors but strips other attributes", () => {
    const html = '<a class="btn" href="https://example.it/bando" data-track="click">Bando</a>';
    const result = sanitizeHtml(html);
    expect(result).toContain('href="https://example.it/bando"');
    expect(result).not.toContain("class=");
    expect(result).not.toContain("data-track");
  });

  it("strips attributes from non-anchor tags", () => {
    const html = '<p class="intro" style="color:red">Testo</p>';
    const result = sanitizeHtml(html);
    expect(result).toContain("<p>");
    expect(result).toContain("Testo");
    expect(result).not.toContain("class=");
  });

  it("removes noise tags (div, span, section, img, etc.)", () => {
    const html = '<div class="card"><span>€</span><p>50.000</p></div>';
    const result = sanitizeHtml(html);
    expect(result).toContain("50.000");
    expect(result).not.toContain("<div");
    expect(result).not.toContain("<span");
  });

  it("keeps semantic tags (h1-h6, p, ul, li, table, a)", () => {
    const html = "<h2>Bandi aperti</h2><ul><li>Bando A</li></ul><table><tr><td>€ 10.000</td></tr></table>";
    const result = sanitizeHtml(html);
    expect(result).toContain("<h2>");
    expect(result).toContain("<ul>");
    expect(result).toContain("<li>");
    expect(result).toContain("<table>");
  });

  it("collapses whitespace", () => {
    const html = "<p>Bando     con     spazi</p>";
    expect(sanitizeHtml(html)).toContain("Bando con spazi");
  });

  it("truncates to 80K characters", () => {
    const html = "<p>" + "x".repeat(100_000) + "</p>";
    expect(sanitizeHtml(html).length).toBeLessThanOrEqual(80_000);
  });

  it("removes HTML comments", () => {
    const html = "<!-- Google Tag Manager --><p>Bando</p><!-- end GTM -->";
    const result = sanitizeHtml(html);
    expect(result).not.toContain("Google Tag");
    expect(result).toContain("Bando");
  });

  it("decodes common entities", () => {
    const html = "<p>A &amp; B &lt; C &gt; D</p>";
    const result = sanitizeHtml(html);
    expect(result).toContain("A & B");
  });

  it("handles a realistic grant listing page", () => {
    const html = `
      <html><head><style>.x{}</style><script>var a=1;</script></head>
      <body>
        <nav><a href="/">Home</a><a href="/chi-siamo">Chi siamo</a></nav>
        <main>
          <h1>Bandi aperti</h1>
          <div class="card">
            <h2><a class="link" href="https://example.it/bando-sport" data-id="1">Bando Sport 2026</a></h2>
            <p class="desc">Scadenza: 31/12/2026</p>
            <p>Importo: € 50.000</p>
          </div>
        </main>
        <footer><p>© 2026 Regione</p></footer>
      </body></html>
    `;
    const result = sanitizeHtml(html);
    expect(result).toContain("Bandi aperti");
    expect(result).toContain('href="https://example.it/bando-sport"');
    expect(result).toContain("Bando Sport 2026");
    expect(result).toContain("Scadenza: 31/12/2026");
    expect(result).toContain("€ 50.000");
    expect(result).not.toContain("<script");
    expect(result).not.toContain("<style");
    expect(result).not.toContain("Cookie");
    expect(result.length).toBeLessThan(html.length);
  });
});
