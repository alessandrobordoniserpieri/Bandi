// Launch every agent's A2A server on its fixed port and keep them running.
// Each server exposes its Agent Card at `<url>/.well-known/agent-card.json` and
// a JSON-RPC endpoint at `<url>/`.
//
//   A2A_EXECUTOR=claude tsx src/serve.ts   # real Claude Code behind each agent
//   tsx src/serve.ts                        # offline MockExecutor (default)

import { AGENT_DEFS, buildAgentCard } from "./agent-defs.ts";
import { ClaudeCliExecutor, MockExecutor, type Executor } from "./executor.ts";
import { A2AServer } from "./server.ts";

async function main(): Promise<void> {
  const executor: Executor =
    process.env.A2A_EXECUTOR === "claude" ? new ClaudeCliExecutor() : new MockExecutor();

  const servers: A2AServer[] = [];
  for (const def of AGENT_DEFS) {
    const server = new A2AServer({ def, executor });
    const url = await server.listen();
    servers.push(server);
    const card = buildAgentCard(def, url);
    console.log(`▸ ${def.name.padEnd(18)} ${url}  (${card.skills.length} skills advertised)`);
  }
  console.log(
    `\n${servers.length} A2A agents up with ${executor.constructor.name}. ` +
      `Cards at <url>/.well-known/agent-card.json. Ctrl-C to stop.`,
  );

  const shutdown = async () => {
    await Promise.all(servers.map((s) => s.close()));
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
