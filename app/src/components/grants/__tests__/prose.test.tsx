import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Prose } from "../prose";

describe("Prose", () => {
  it("renders a plain paragraph with no markup as a single <p>", () => {
    const html = renderToStaticMarkup(<Prose text="Con 1.000.000 euro di risorse." />);
    expect(html).toBe('<p class="detail-prose">Con 1.000.000 euro di risorse.</p>');
  });

  it("renders '## ' and '### ' lines as real headings, not paragraph text", () => {
    const html = renderToStaticMarkup(<Prose text={"## Finalità\ntesto del paragrafo.\n### Ripartizione territoriale:"} />);
    expect(html).toContain('<h3 class="detail-prose-heading">Finalità</h3>');
    expect(html).toContain('<p class="detail-prose">testo del paragrafo.</p>');
    expect(html).toContain('<h4 class="detail-prose-subheading">Ripartizione territoriale:</h4>');
  });

  it("groups consecutive '- ' lines into one <ul>, not one <ul> per item", () => {
    const html = renderToStaticMarkup(<Prose text={"- primo punto\n- secondo punto\naltro paragrafo"} />);
    const ulCount = (html.match(/<ul/g) ?? []).length;
    expect(ulCount).toBe(1);
    expect(html).toContain('<ul class="detail-prose-list"><li>primo punto</li><li>secondo punto</li></ul>');
    expect(html).toContain('<p class="detail-prose">altro paragrafo</p>');
  });

  it("starts a new <ul> when a list resumes after a heading in between", () => {
    const html = renderToStaticMarkup(<Prose text={"- a\n## Titolo\n- b"} />);
    const ulCount = (html.match(/<ul/g) ?? []).length;
    expect(ulCount).toBe(2);
  });

  it("drops blank lines instead of rendering empty paragraphs", () => {
    const html = renderToStaticMarkup(<Prose text={"prima riga\n\n\nseconda riga"} />);
    expect((html.match(/<p/g) ?? []).length).toBe(2);
  });
});
