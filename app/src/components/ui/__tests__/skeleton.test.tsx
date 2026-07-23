import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Skeleton } from "../skeleton";

describe("Skeleton", () => {
  it("is hidden from assistive technology (it is a placeholder, not content)", () => {
    const html = renderToStaticMarkup(<Skeleton />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("skeleton");
  });

  it("applies width and height as inline sizing", () => {
    const html = renderToStaticMarkup(<Skeleton width="10rem" height={12} />);
    expect(html).toContain("width:10rem");
    expect(html).toContain("height:12px");
  });

  it("merges a custom className onto the base skeleton class", () => {
    const html = renderToStaticMarkup(<Skeleton className="skeleton-title" />);
    expect(html).toContain("skeleton");
    expect(html).toContain("skeleton-title");
  });
});
