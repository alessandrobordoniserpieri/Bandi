// A small discovery registry: spins up an A2AServer per agent def and hands out
// discovered A2AClients by key. This is the "network" the agents live on — each
// agent can look up and call any peer through it.

import { A2AClient } from "./client.ts";
import { AGENT_DEFS, type AgentDef, agentByKey } from "./agent-defs.ts";
import type { Executor } from "./executor.ts";
import { A2AServer } from "./server.ts";

export class AgentNetwork {
  private servers = new Map<string, A2AServer>();
  private clients = new Map<string, A2AClient>();

  private constructor(private readonly executor: Executor) {}

  /** Start every agent's A2A server and discover each via its card. */
  static async start(
    executor: Executor,
    opts: { host?: string; ephemeralPorts?: boolean } = {},
  ): Promise<AgentNetwork> {
    const net = new AgentNetwork(executor);
    for (const def of AGENT_DEFS) {
      const server = new A2AServer({
        def,
        executor,
        host: opts.host,
        port: opts.ephemeralPorts ? 0 : def.port,
      });
      const url = await server.listen();
      net.servers.set(def.key, server);
      net.clients.set(def.key, await A2AClient.discover(url));
    }
    return net;
  }

  client(key: string): A2AClient {
    const c = this.clients.get(key);
    if (!c) throw new Error(`No agent in network for key: ${key}`);
    return c;
  }

  def(key: string): AgentDef {
    return agentByKey(key);
  }

  keys(): string[] {
    return [...this.clients.keys()];
  }

  async stop(): Promise<void> {
    await Promise.all([...this.servers.values()].map((s) => s.close()));
  }
}
