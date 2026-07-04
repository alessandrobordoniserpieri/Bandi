# ADR-002 — AI provider-agnostic seam

## Status
Accepted (branch 007).

## Context
Grant extraction needs an LLM, but pricing, availability, and quality shift across
providers (Gemini free, Anthropic, Groq, OpenAI). Coupling the pipeline to one SDK
would make switching a rewrite.

## Decision
The scraper lives in a top-level `scraper/` package, separate from `app/`. The LLM sits
behind a minimal seam — `interface LLMProvider { name; extract({html, schema, instructions}) }`
— with interchangeable adapters selected by an env var (`AI_PROVIDER`). The interface is
deliberately minimal (one method); errors surface as `ProviderError` with a retry hint.
Fetching (`PageFetcher`) and persistence (`GrantsDb`) are seams too, so the whole pipeline
runs against fakes with no network or API keys.

## Consequences
- Switching providers = changing one env var + adding an adapter; the pipeline is untouched.
- The scraper is a separate bounded context: it does not import from `app/` and keeps its own
  copy of the matching vocabularies (47 tags, 62 legal types) for validating AI output.
- Real adapters (Browserless fetcher, provider SDKs, Supabase-backed GrantsDb) are wired in
  branches 008/009; branch 007 ships only seams, fakes, and the pure pipeline stages.
