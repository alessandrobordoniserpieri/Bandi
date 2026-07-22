import { describe, it, expect } from "vitest";
import { chunkText } from "../chunk-text";

describe("chunkText", () => {
  it("returns a single chunk for text under the chunk size", () => {
    const chunks = chunkText("testo breve del bando", { size: 100, overlap: 20 });
    expect(chunks).toEqual(["testo breve del bando"]);
  });

  it("splits long text into overlapping chunks, stopping once the tail is covered", () => {
    const text = "a".repeat(250);
    const chunks = chunkText(text, { size: 100, overlap: 20 });
    // step = size - overlap = 80 → starts 0, 80, 160; chunk at 160 covers 160..250 (the end), stop.
    expect(chunks.length).toBe(3);
    expect(chunks[0]!.length).toBe(100);
    expect(chunks[2]!.length).toBe(90); // slice(160, 260) clamps to 250
  });

  it("consecutive chunks overlap by the requested amount", () => {
    const text = Array.from({ length: 300 }, (_, i) => String.fromCharCode(97 + (i % 26))).join("");
    const chunks = chunkText(text, { size: 100, overlap: 20 });
    const tailOfFirst = chunks[0]!.slice(-20);
    const headOfSecond = chunks[1]!.slice(0, 20);
    expect(headOfSecond).toBe(tailOfFirst);
  });

  it("drops whitespace-only chunks and trims nothing internal", () => {
    const chunks = chunkText("   ", { size: 100, overlap: 20 });
    expect(chunks).toEqual([]);
  });

  it("uses sane defaults when options are omitted", () => {
    const chunks = chunkText("x".repeat(5000));
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]!.length).toBe(2000);
  });
});
