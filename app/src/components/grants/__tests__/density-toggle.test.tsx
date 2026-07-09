import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DensityToggle } from "../density-toggle";

function buttonHtml(html: string, label: string): string {
  const idx = html.indexOf(label);
  const start = html.lastIndexOf("<button", idx);
  const end = html.indexOf("</button>", idx) + "</button>".length;
  return html.slice(start, end);
}

describe("DensityToggle", () => {
  it("renders both mode labels", () => {
    const html = renderToStaticMarkup(<DensityToggle current="card" />);
    expect(html).toContain("Vista a card");
    expect(html).toContain("Vista compatta");
  });

  it("marks card as pressed when current is card", () => {
    const html = renderToStaticMarkup(<DensityToggle current="card" />);
    expect(buttonHtml(html, "Vista a card")).toContain('aria-pressed="true"');
    expect(buttonHtml(html, "Vista compatta")).toContain('aria-pressed="false"');
  });

  it("marks compact as pressed when current is compact", () => {
    const html = renderToStaticMarkup(<DensityToggle current="compact" />);
    expect(buttonHtml(html, "Vista compatta")).toContain('aria-pressed="true"');
    expect(buttonHtml(html, "Vista a card")).toContain('aria-pressed="false"');
  });

  it("carries the density-toggle class and a data-density attribute for CSS/QA hooks", () => {
    const html = renderToStaticMarkup(<DensityToggle current="compact" />);
    expect(html).toContain("density-toggle");
    expect(html).toContain('data-density="compact"');
  });
});
