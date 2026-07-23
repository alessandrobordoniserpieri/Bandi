import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StatusBadge } from "../status-badge";

describe("StatusBadge", () => {
  it("renders the Italian label for the pipeline status", () => {
    const html = renderToStaticMarkup(<StatusBadge status="in_preparazione" />);
    expect(html).toContain("In preparazione");
  });

  it("carries the raw status as a data attribute for styling/testing", () => {
    const html = renderToStaticMarkup(<StatusBadge status="candidato" />);
    expect(html).toContain('data-status="candidato"');
  });
});
