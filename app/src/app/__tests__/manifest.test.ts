import { describe, it, expect } from "vitest";
import manifest from "../manifest";

describe("PWA manifest", () => {
  const m = manifest();

  it("is a standalone Italian app named Combacia", () => {
    expect(m.name).toBe("Combacia");
    expect(m.short_name).toBe("Bandi");
    expect(m.lang).toBe("it");
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBe("/");
    expect(m.theme_color).toBe("#2563eb");
  });

  it("ships 192 + 512 icons and a maskable one", () => {
    const sizes = (m.icons ?? []).map((i) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    expect((m.icons ?? []).some((i) => i.purpose === "maskable")).toBe(true);
  });
});
