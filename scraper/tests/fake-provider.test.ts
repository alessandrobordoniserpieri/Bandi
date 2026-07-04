import { describe, it, expect } from "vitest";
import { FakeLLMProvider } from "../src/providers/fake";
import { ProviderError } from "../src/providers/types";

describe("FakeLLMProvider", () => {
  it("returns the canned response for known html", async () => {
    const p = new FakeLLMProvider(new Map([["<h1>x</h1>", [{ title: "T" }]]]));
    expect(await p.extract({ html: "<h1>x</h1>", schema: {}, instructions: "" })).toEqual([{ title: "T" }]);
  });
  it("returns [] for unknown html by default", async () => {
    const p = new FakeLLMProvider(new Map());
    expect(await p.extract({ html: "nope", schema: {}, instructions: "" })).toEqual([]);
  });
  it("throws a retryable ProviderError when configured to", async () => {
    const p = new FakeLLMProvider(new Map(), "throw");
    await expect(p.extract({ html: "nope", schema: {}, instructions: "" })).rejects.toBeInstanceOf(ProviderError);
  });
});
