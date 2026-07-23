# Bandi A2A — Agent2Agent infrastructure for the FE-redesign team

This package makes the five FE-redesign agents (defined in `.claude/agents/`)
talk to each other over the **A2A (Agent2Agent) protocol** — the open standard
for agent interoperability: JSON-RPC 2.0 transport, a discovery **Agent Card** at
`/.well-known/agent-card.json`, and a **Task** lifecycle with **Artifacts**.

It is a faithful, dependency-light subset of the spec, implemented on Node's
built-in `http` (no external runtime deps).

## Why this exists

Claude Code subagents normally coordinate through the parent session. This layer
instead exposes each agent as a **standalone A2A server** that peers discover and
call directly — real agent-to-agent messaging, not orchestrator relay.

## The agents (roles from `.claude/agents/`)

| Agent | Port | Mandated skills (loaded on every run) |
|-------|------|----------------------------------------|
| `fe-builder` | 4101 | superpowers (TDD/debugging/verification), impeccable, dataviz, design:accessibility |
| `design-reviewer` | 4102 | superpowers (code-review), impeccable, design:critique, design:accessibility |
| `fe-test-engineer` | 4103 | superpowers (TDD/verification/debugging) |
| `fe-prototyper` | 4104 | web-artifacts-builder, mattpocock-skills:prototype, impeccable |
| `fe-docs-writer` | 4105 | superpowers (writing/executing-plans), mattpocock-skills:domain-modeling |

The mandated skills are **kept active**: they are re-asserted in each agent's
system prompt by the executor and advertised in the agent's A2A card (as a
`mandated-skills` entry). superpowers, Pocock, and impeccable are installed at
user scope, so a real `claude -p` run behind an agent loads them.

## Architecture

```
              ┌─────────── Agent Card (/.well-known/agent-card.json) ── discovery
A2AClient ──▶ │ A2AServer (JSON-RPC 2.0 over HTTP)
              │   message/send · message/stream (SSE) · tasks/get · tasks/cancel
              │        │
              │        ▼
              │   TaskStore  (submitted → working → completed/failed, + artifacts)
              │        │
              │        ▼
              │   Executor   ── ClaudeCliExecutor (real: claude -p + role prompt)
              └──────────────── MockExecutor (offline: deterministic, for tests)
```

Files:
- `src/protocol.ts` — A2A types (AgentCard, Task, Message, Artifact, JSON-RPC).
- `src/agent-defs.ts` — the five roles + `buildAgentCard`.
- `src/task-store.ts` — task lifecycle + SSE subscriptions.
- `src/executor.ts` — `ClaudeCliExecutor` (loads `.claude/agents/<key>.md`) + `MockExecutor`.
- `src/server.ts` — the A2A JSON-RPC/SSE server.
- `src/client.ts` — the A2A client (discovery + calls).
- `src/registry.ts` — `AgentNetwork`: starts all servers, discovers all peers.
- `src/orchestrator.ts` — drives one redesign task through the team via A2A hand-offs.
- `src/serve.ts` — launch all five servers on their fixed ports.

## Run it

```bash
cd a2a

# Tests (offline MockExecutor — no network, no LLM)
npm test

# Bring up all five A2A servers (offline executor by default)
npm run serve
#   ▸ FE Builder        http://127.0.0.1:4101 ...
#   curl http://127.0.0.1:4101/.well-known/agent-card.json

# Drive one redesign task through the whole team over A2A
npm run orchestrate -- "Implement the global sidebar (DEC-3)"
```

### Real execution (Claude behind each agent)

Set `A2A_EXECUTOR=claude` to have each agent server run the actual Claude Code
CLI headless with its role's system prompt (and therefore its mandated skills):

```bash
A2A_EXECUTOR=claude npm run serve
A2A_EXECUTOR=claude npm run orchestrate -- "Redesign the Kanban card (DEC-2)"
```

Requires the `claude` CLI on PATH and the plugins installed (superpowers,
impeccable, mattpocock-skills) — see `.claude/agents/README.md`.

## Protocol notes

- **Discovery**: `GET /.well-known/agent-card.json` returns the Agent Card.
- **JSON-RPC** at `POST /`: `message/send` (blocking, returns the final Task),
  `message/stream` (SSE stream of task + updates), `tasks/get`, `tasks/cancel`.
- **Task states**: `submitted → working → completed | failed | canceled`.
- **Hand-offs**: the orchestrator threads all calls under one `contextId`, so a
  task's journey across the team is one correlated A2A conversation.

This is a working subset for coordinating the redesign team; it is not the full
A2A spec surface (no push-notification config, auth schemes, or extension
negotiation). Those can be layered on `server.ts` without changing the roles.
