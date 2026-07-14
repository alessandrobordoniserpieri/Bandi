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

  it("orders sources by priority (high → medium → low)", async () => {
    const stub = new StubSupabaseClient({
      grant_sources: {
        data: [
          { id: "lo", name: "Low", url: "https://lo", priority: "low" },
          { id: "hi", name: "High", url: "https://hi", priority: "high" },
          { id: "me", name: "Medium", url: "https://me", priority: "medium" },
        ],
      },
    });
    const sources = await loadEnabledSources(asClient(stub));
    expect(sources.map((s) => s.id)).toEqual(["hi", "me", "lo"]);
  });

  it("treats a missing priority as medium", async () => {
    const stub = new StubSupabaseClient({
      grant_sources: {
        data: [
          { id: "lo", name: "Low", url: "https://lo", priority: "low" },
          { id: "def", name: "NoPriority", url: "https://def" },
          { id: "hi", name: "High", url: "https://hi", priority: "high" },
        ],
      },
    });
    const sources = await loadEnabledSources(asClient(stub));
    expect(sources.map((s) => s.id)).toEqual(["hi", "def", "lo"]);
  });

  it("within a priority band, orders by last_run_at ascending with never-run (null) first", async () => {
    const stub = new StubSupabaseClient({
      grant_sources: {
        data: [
          { id: "recent", name: "Recent", url: "https://r", priority: "medium", last_run_at: "2026-07-14T03:00:00Z" },
          { id: "never", name: "Never", url: "https://n", priority: "medium" },
          { id: "old", name: "Old", url: "https://o", priority: "medium", last_run_at: "2026-07-10T03:00:00Z" },
        ],
      },
    });
    const sources = await loadEnabledSources(asClient(stub));
    expect(sources.map((s) => s.id)).toEqual(["never", "old", "recent"]);
  });

  it("priority dominates the last_run_at tiebreaker", async () => {
    const stub = new StubSupabaseClient({
      grant_sources: {
        data: [
          // low priority but never run — must still come after a recently-run high priority source
          { id: "lo-never", name: "LowNever", url: "https://ln", priority: "low" },
          { id: "hi-recent", name: "HiRecent", url: "https://hr", priority: "high", last_run_at: "2026-07-14T03:00:00Z" },
        ],
      },
    });
    const sources = await loadEnabledSources(asClient(stub));
    expect(sources.map((s) => s.id)).toEqual(["hi-recent", "lo-never"]);
  });
});
