import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadEnabledSources } from "../src/sources";
import { StubSupabaseClient } from "./helpers/supabase-stub";

const asClient = (s: StubSupabaseClient) => s as unknown as SupabaseClient;

describe("loadEnabledSources", () => {
  it("selects enabled grant_sources and maps them to SourceConfig", async () => {
    const stub = new StubSupabaseClient({
      grant_sources: {
        data: [
          { id: "s1", name: "Sport", url: "https://sport", scrape_config: { maxPages: 2 } },
          { id: "s2", name: "ETS", url: "https://ets", scrape_config: {} },
        ],
      },
    });
    const sources = await loadEnabledSources(asClient(stub));
    expect(stub.records.grant_sources!.eq).toEqual([["enabled", true]]);
    expect(sources).toEqual([
      { id: "s1", name: "Sport", url: "https://sport", scrapeConfig: { maxPages: 2 } },
      { id: "s2", name: "ETS", url: "https://ets" },
    ]);
  });

  it("returns [] when there are no enabled sources", async () => {
    const stub = new StubSupabaseClient({ grant_sources: { data: [] } });
    expect(await loadEnabledSources(asClient(stub))).toEqual([]);
  });

  it("throws on a query error", async () => {
    const stub = new StubSupabaseClient({ grant_sources: { error: { message: "db down" } } });
    await expect(loadEnabledSources(asClient(stub))).rejects.toThrow(/db down/);
  });
});
