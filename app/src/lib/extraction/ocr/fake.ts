// app/src/lib/extraction/ocr/fake.ts
// Deterministic OcrProvider for tests (mirrors FakeLLMProvider). Either returns a fixed string
// for every image, or a queued sequence (one per page), or throws a supplied error.
import type { OcrProvider } from "../types";

export class FakeOcrProvider implements OcrProvider {
  readonly name = "fake-ocr";
  private queue: Array<string | Error>;
  constructor(private readonly responses: string | Array<string | Error>) {
    this.queue = Array.isArray(responses) ? [...responses] : [];
  }
  async ocr(_image: Uint8Array): Promise<string> {
    if (typeof this.responses === "string") return this.responses;
    const next = this.queue.shift();
    if (next === undefined) return "";
    if (next instanceof Error) throw next;
    return next;
  }
}
