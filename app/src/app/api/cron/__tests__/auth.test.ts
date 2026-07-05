import { describe, it, expect } from "vitest";
import { isAuthorized } from "../auth";

describe("isAuthorized", () => {
  it("accepts the correct Bearer secret", () => {
    expect(isAuthorized("Bearer s3cret", "s3cret")).toBe(true);
  });
  it("rejects a missing header", () => {
    expect(isAuthorized(null, "s3cret")).toBe(false);
  });
  it("rejects a wrong secret", () => {
    expect(isAuthorized("Bearer nope", "s3cret")).toBe(false);
  });
  it("rejects a malformed header (no Bearer prefix)", () => {
    expect(isAuthorized("s3cret", "s3cret")).toBe(false);
  });
  it("rejects when the server secret is unset", () => {
    expect(isAuthorized("Bearer s3cret", undefined)).toBe(false);
    expect(isAuthorized("Bearer ", "")).toBe(false);
  });
});
