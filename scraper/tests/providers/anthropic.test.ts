import { describe, it, expect } from "vitest";
import { AnthropicProvider } from "../../src/providers/anthropic";
import { ProviderError } from "../../src/providers/types";
import { bodyOf, mockFetch, mockResponse, noWaitRetry } from "../helpers/http";

const schema = { type: "array" } as const;
const input = { html: "<h1>Bando</h1>", schema, instructions: "Estrai i bandi." };

function toolUseEnvelope(grants: unknown) {
  return { content: [{ type: "tool_use", name: "extract_grants", input: { grants } }] };
}

describe("AnthropicProvider", () => {
  it("builds a tool-use request wrapping the array schema in an object", async () => {
    const { fetchImpl, requests } = mockFetch([mockResponse(200, toolUseEnvelope([]))]);
    await new AnthropicProvider({ apiKey: "secret", model: "claude-x", fetchImpl }).extract(input);

    expect(requests[0]!.url).toBe("https://api.anthropic.com/v1/messages");
    expect(requests[0]!.init.headers["x-api-key"]).toBe("secret");
    expect(requests[0]!.init.headers["anthropic-version"]).toBe("2023-06-01");
    const body = bodyOf(requests[0]!);
    expect(body.model).toBe("claude-x");
    const tool = (body.tools as Record<string, unknown>[])[0]!;
    expect(tool.name).toBe("extract_grants");
    const inputSchema = tool.input_schema as Record<string, unknown>;
    expect(inputSchema.type).toBe("object");
    expect((inputSchema.properties as Record<string, unknown>).grants).toEqual(schema);
    expect(body.tool_choice).toEqual({ type: "tool", name: "extract_grants" });
  });

  it("returns the tool_use input.grants (already a parsed value)", async () => {
    const grants = [{ title: "A", url: "https://x/1" }];
    const { fetchImpl } = mockFetch([mockResponse(200, toolUseEnvelope(grants))]);
    const out = await new AnthropicProvider({ apiKey: "k", fetchImpl }).extract(input);
    expect(out).toEqual(grants);
  });

  it("retries a 529 (overloaded) then succeeds", async () => {
    const { fetchImpl, requests } = mockFetch([mockResponse(529, {}), mockResponse(200, toolUseEnvelope([]))]);
    const out = await new AnthropicProvider({ apiKey: "k", fetchImpl, ...noWaitRetry }).extract(input);
    expect(out).toEqual([]);
    expect(requests).toHaveLength(2);
  });

  it("throws a ProviderError when no tool_use block is present", async () => {
    const { fetchImpl } = mockFetch([mockResponse(200, { content: [{ type: "text", text: "ciao" }] })]);
    await expect(new AnthropicProvider({ apiKey: "k", fetchImpl }).extract(input)).rejects.toBeInstanceOf(
      ProviderError,
    );
  });
});
