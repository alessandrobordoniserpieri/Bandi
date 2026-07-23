// Smoke tests for the A2A infrastructure, using the offline MockExecutor so they
// run with no network and no LLM. Exercises: agent-card discovery, the full
// message/task/artifact lifecycle, tasks/get, tasks/cancel, and an end-to-end
// orchestrated flow of real agent-to-agent hand-offs.

import assert from "node:assert/strict";
import { test } from "node:test";
import { A2AClient, taskResultText } from "./client.ts";
import { AGENT_DEFS, buildAgentCard } from "./agent-defs.ts";
import { MockExecutor, stripFrontmatter } from "./executor.ts";
import { AgentNetwork } from "./registry.ts";
import { A2AServer } from "./server.ts";
import { runRedesignTask } from "./orchestrator.ts";

test("agent card is served at the well-known path and lists mandated skills", async () => {
  const def = AGENT_DEFS.find((d) => d.key === "fe-builder")!;
  const server = new A2AServer({ def, executor: new MockExecutor(), port: 0 });
  const url = await server.listen();
  try {
    const client = await A2AClient.discover(url);
    assert.equal(client.card.name, "FE Builder");
    assert.equal(client.card.capabilities.streaming, true);
    const mandated = client.card.skills.find((s) => s.id === "mandated-skills");
    assert.ok(mandated, "card advertises mandated-skills");
    assert.ok(mandated!.tags.includes("impeccable:impeccable"));
    assert.ok(mandated!.tags.includes("superpowers:test-driven-development"));
  } finally {
    await server.close();
  }
});

test("message/send runs the task to completion and returns an artifact", async () => {
  const def = AGENT_DEFS.find((d) => d.key === "design-reviewer")!;
  const server = new A2AServer({ def, executor: new MockExecutor(), port: 0 });
  const url = await server.listen();
  try {
    const client = await A2AClient.discover(url);
    const task = await client.sendMessage("Review the sidebar");
    assert.equal(task.status.state, "completed");
    assert.equal(task.kind, "task");
    assert.match(taskResultText(task), /Design Reviewer/);
    // tasks/get returns the same task.
    const fetched = await client.getTask(task.id);
    assert.equal(fetched.id, task.id);
    assert.equal(fetched.status.state, "completed");
  } finally {
    await server.close();
  }
});

test("tasks/cancel rejects an already-terminal task", async () => {
  const def = AGENT_DEFS[0];
  const server = new A2AServer({ def, executor: new MockExecutor(), port: 0 });
  const url = await server.listen();
  try {
    const client = await A2AClient.discover(url);
    const task = await client.sendMessage("do it");
    await assert.rejects(() => client.cancelTask(task.id), /already completed/);
  } finally {
    await server.close();
  }
});

test("orchestrated redesign task performs real A2A hand-offs across the team", async () => {
  const net = await AgentNetwork.start(new MockExecutor(), { ephemeralPorts: true });
  try {
    const steps = await runRedesignTask(net, "Implement the global sidebar (DEC-3)");
    const agents = steps.map((s) => s.agent);
    assert.deepEqual(agents, [
      "fe-test-engineer",
      "fe-builder",
      "design-reviewer",
      "fe-docs-writer",
    ]);
    assert.ok(steps.every((s) => s.state === "completed"));
    // Each hand-off carried the mandated skills into the executed work.
    assert.match(
      steps.find((s) => s.agent === "fe-builder")!.output,
      /impeccable:impeccable/,
    );
  } finally {
    await net.stop();
  }
});

test("kanban task prototypes first", async () => {
  const net = await AgentNetwork.start(new MockExecutor(), { ephemeralPorts: true });
  try {
    const steps = await runRedesignTask(net, "Redesign the Kanban card (DEC-2)", {
      prototypeFirst: true,
    });
    assert.equal(steps[0].agent, "fe-prototyper");
  } finally {
    await net.stop();
  }
});

test("buildAgentCard and stripFrontmatter behave", () => {
  const card = buildAgentCard(AGENT_DEFS[0], "http://x:1");
  assert.equal(card.url, "http://x:1");
  assert.equal(card.protocolVersion, "0.2.0");
  assert.equal(stripFrontmatter("---\nname: x\n---\nBODY").trim(), "BODY");
  assert.equal(stripFrontmatter("no frontmatter"), "no frontmatter");
});
