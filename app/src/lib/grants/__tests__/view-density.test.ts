import { describe, it, expect } from "vitest";
import { parseDensityCookie, serializeDensityCookie, DENSITY_COOKIE } from "../view-density";

describe("parseDensityCookie", () => {
  it("defaults to card view when the cookie is missing", () => {
    expect(parseDensityCookie(undefined)).toBe("card");
  });
  it("defaults to card view for an unknown value", () => {
    expect(parseDensityCookie("bogus")).toBe("card");
  });
  it("parses 'compact' as compact view", () => {
    expect(parseDensityCookie("compact")).toBe("compact");
  });
  it("parses 'card' as card view", () => {
    expect(parseDensityCookie("card")).toBe("card");
  });
});

describe("serializeDensityCookie", () => {
  it("round-trips card view", () => {
    expect(parseDensityCookie(serializeDensityCookie("card"))).toBe("card");
  });
  it("round-trips compact view", () => {
    expect(parseDensityCookie(serializeDensityCookie("compact"))).toBe("compact");
  });
});

describe("DENSITY_COOKIE", () => {
  it("is a stable cookie name", () => {
    expect(DENSITY_COOKIE).toBe("bandi-density");
  });
});
