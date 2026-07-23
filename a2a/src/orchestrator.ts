// Orchestrator: drives one unit of redesign work through the agent team over A2A.
// It does not do the work itself — it delegates to agents, and the agents hand
// off to their peers (fe-prototyper? -> fe-builder <-> fe-test-engineer ->
// design-reviewer -> fe-docs-writer), each call being a real A2A message/send.

import { taskResultText } from "./client.ts";
import { MockExecutor, ClaudeCliExecutor, type Executor } from "./executor.ts";
import { AgentNetwork } from "./registry.ts";
import { TERMINAL_STATES } from "./protocol.ts";

export interface OrchestrationStep {
  agent: string;
  taskId: string;
  state: string;
  output: string;
}

/**
 * Run a single redesign task (e.g. "Implement the global sidebar (DEC-3)")
 * through the standard flow. `contextId` threads all hand-offs into one A2A
 * conversation so the team's work on this task is correlated.
 */
export async function runRedesignTask(
  net: AgentNetwork,
  task: string,
  opts: { prototypeFirst?: boolean } = {},
): Promise<OrchestrationStep[]> {
  const contextId = `redesign-${Date.now().toString(36)}`;
  const steps: OrchestrationStep[] = [];

  const call = async (agentKey: string, prompt: string) => {
    const result = await net.client(agentKey).sendMessage(prompt, { contextId });
    const step: OrchestrationStep = {
      agent: agentKey,
      taskId: result.id,
      state: result.status.state,
      output: taskResultText(result),
    };
    steps.push(step);
    if (result.status.state === "failed") {
      throw new Error(`${agentKey} failed: ${step.output}`);
    }
    if (!TERMINAL_STATES.has(result.status.state)) {
      throw new Error(`${agentKey} did not reach a terminal state (${result.status.state})`);
    }
    return step;
  };

  // 1. Optional: de-risk an uncertain screen with a throwaway prototype.
  let priorContext = "";
  if (opts.prototypeFirst) {
    const proto = await call("fe-prototyper", `Prototype for validation: ${task}`);
    priorContext = `\nPrototyper notes:\n${proto.output}`;
  }

  // 2. Test engineer drives the red step, then the builder implements.
  await call("fe-test-engineer", `Write failing-first tests for: ${task}`);
  const built = await call(
    "fe-builder",
    `Implement: ${task}. Ship loading/error/empty states.${priorContext}`,
  );

  // 3. Design reviewer gates the delivered screen.
  const review = await call(
    "design-reviewer",
    `Review the implementation of: ${task}\n\n---\n${built.output}`,
  );

  // 4. Docs writer records what shipped.
  await call(
    "fe-docs-writer",
    `Document the shipped change and update the vocabulary for: ${task}\n\n---\n${review.output}`,
  );

  return steps;
}

function pickExecutor(): Executor {
  return process.env.A2A_EXECUTOR === "claude" ? new ClaudeCliExecutor() : new MockExecutor();
}

// CLI entry: `tsx src/orchestrator.ts "Implement the global sidebar (DEC-3)"`
// Set A2A_EXECUTOR=claude to run the real Claude Code CLI behind each agent.
async function main(): Promise<void> {
  const task = process.argv.slice(2).join(" ") || "Implement the global sidebar (DEC-3)";
  const executor = pickExecutor();
  const net = await AgentNetwork.start(executor, { ephemeralPorts: true });
  try {
    console.log(`Orchestrating over A2A (${executor.constructor.name}): "${task}"\n`);
    const steps = await runRedesignTask(net, task, { prototypeFirst: /kanban/i.test(task) });
    for (const s of steps) {
      console.log(`— ${s.agent} [${s.state}] task=${s.taskId}`);
      console.log(`  ${s.output.replace(/\n/g, "\n  ")}\n`);
    }
    console.log(`Done: ${steps.length} A2A hand-offs, all terminal-completed.`);
  } finally {
    await net.stop();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
