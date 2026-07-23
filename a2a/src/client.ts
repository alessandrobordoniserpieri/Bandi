// A2A client: discovers an agent by its card and calls it over JSON-RPC.
// This is what one agent uses to delegate to a peer (true agent-to-agent),
// and what the orchestrator uses to drive the whole team.

import {
  type AgentCard,
  type JsonRpcResponse,
  type Message,
  type Task,
  A2A_METHODS,
  newId,
  textMessage,
} from "./protocol.ts";

export class A2AClient {
  private constructor(
    readonly card: AgentCard,
    private readonly endpoint: string,
  ) {}

  /** Discover an agent by fetching its well-known Agent Card. */
  static async discover(baseUrl: string): Promise<A2AClient> {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/.well-known/agent-card.json`);
    if (!res.ok) throw new Error(`Agent card fetch failed: ${res.status}`);
    const card = (await res.json()) as AgentCard;
    return new A2AClient(card, card.url || baseUrl);
  }

  /** Blocking send: returns the final Task (completed/failed). */
  async sendMessage(text: string, ctx?: { contextId?: string; taskId?: string }): Promise<Task> {
    const message: Message = textMessage("user", text, {
      contextId: ctx?.contextId,
      taskId: ctx?.taskId,
    });
    const body = {
      jsonrpc: "2.0" as const,
      id: newId("rpc"),
      method: A2A_METHODS.messageSend,
      params: { message, configuration: { blocking: true } },
    };
    const res = await fetch(this.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const rpc = (await res.json()) as JsonRpcResponse<Task>;
    if ("error" in rpc) throw new Error(`${this.card.name}: ${rpc.error.message}`);
    return rpc.result;
  }

  async getTask(id: string): Promise<Task> {
    return this.call<Task>(A2A_METHODS.tasksGet, { id });
  }

  async cancelTask(id: string): Promise<Task> {
    return this.call<Task>(A2A_METHODS.tasksCancel, { id });
  }

  private async call<R>(method: string, params: unknown): Promise<R> {
    const res = await fetch(this.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: newId("rpc"), method, params }),
    });
    const rpc = (await res.json()) as JsonRpcResponse<R>;
    if ("error" in rpc) throw new Error(`${this.card.name}: ${rpc.error.message}`);
    return rpc.result;
  }
}

/** Extract the concatenated text of a task's artifacts. */
export function taskResultText(task: Task): string {
  return (task.artifacts ?? [])
    .flatMap((a) => a.parts)
    .filter((p): p is { kind: "text"; text: string } => p.kind === "text")
    .map((p) => p.text)
    .join("\n");
}
