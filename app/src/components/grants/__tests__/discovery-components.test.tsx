import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EmptyState } from "../empty-state";

describe("EmptyState", () => {
  it("invites completing the profile when incomplete", () => {
    const html = renderToStaticMarkup(<EmptyState profileComplete={false} />);
    expect(html).toContain("completa il tuo profilo");
    expect(html).toContain('href="/profilo"');
  });
  it("omits the profile hint when complete", () => {
    const html = renderToStaticMarkup(<EmptyState profileComplete={true} />);
    expect(html).not.toContain('href="/profilo"');
    expect(html).toContain("Nessun bando");
  });
});
