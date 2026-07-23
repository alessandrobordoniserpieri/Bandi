// A2A server: one per agent. Serves the Agent Card at
// `/.well-known/agent-card.json` and a JSON-RPC 2.0 endpoint at `/` implementing
// message/send, message/stream (SSE), tasks/get and tasks/cancel.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { type AgentDef, buildAgentCard } from "./agent-defs.ts";
import type { Executor } from "./executor.ts";
import { TaskStore } from "./task-store.ts";
import {
  A2A_METHODS,
  ERROR,
  type Artifact,
  type JsonRpcError,
  type JsonRpcRequest,
  type Message,
  type MessageSendParams,
  type Task,
  type TaskIdParams,
  collectText,
  newId,
} from "./protocol.ts";

export interface A2AServerOptions {
  def: AgentDef;
  executor: Executor;
  /** Host to bind; defaults to 127.0.0.1. */
  host?: string;
  /** Overrides def.port when set (e.g. 0 for an ephemeral test port). */
  port?: number;
}

export class A2AServer {
  private readonly http: Server;
  private readonly store = new TaskStore();
  private boundUrl = "";

  constructor(private readonly opts: A2AServerOptions) {
    this.http = createServer((req, res) => this.handle(req, res));
  }

  get url(): string {
    return this.boundUrl;
  }

  listen(): Promise<string> {
    const host = this.opts.host ?? "127.0.0.1";
    const port = this.opts.port ?? this.opts.def.port;
    return new Promise((resolvePromise) => {
      this.http.listen(port, host, () => {
        const addr = this.http.address();
        const actualPort = typeof addr === "object" && addr ? addr.port : port;
        this.boundUrl = `http://${host}:${actualPort}`;
        resolvePromise(this.boundUrl);
      });
    });
  }

  close(): Promise<void> {
    return new Promise((resolvePromise, reject) =>
      this.http.close((e) => (e ? reject(e) : resolvePromise())),
    );
  }

  // -- request routing ------------------------------------------------------

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method === "GET" && req.url === "/.well-known/agent-card.json") {
      return this.json(res, 200, buildAgentCard(this.opts.def, this.boundUrl));
    }
    if (req.method !== "POST") {
      return this.json(res, 405, { error: "Use POST for JSON-RPC" });
    }

    let rpc: JsonRpcRequest;
    try {
      rpc = JSON.parse(await readBody(req));
    } catch {
      return this.rpcError(res, null, ERROR.parse, "Invalid JSON");
    }
    if (rpc.jsonrpc !== "2.0" || typeof rpc.method !== "string") {
      return this.rpcError(res, rpc?.id ?? null, ERROR.invalidRequest, "Invalid JSON-RPC request");
    }

    try {
      switch (rpc.method) {
        case A2A_METHODS.messageSend:
          return await this.onMessageSend(res, rpc);
        case A2A_METHODS.messageStream:
          return await this.onMessageStream(res, rpc);
        case A2A_METHODS.tasksGet:
          return this.onTasksGet(res, rpc);
        case A2A_METHODS.tasksCancel:
          return this.onTasksCancel(res, rpc);
        default:
          return this.rpcError(res, rpc.id, ERROR.methodNotFound, `Unknown method: ${rpc.method}`);
      }
    } catch (e) {
      return this.rpcError(res, rpc.id, ERROR.internal, (e as Error).message);
    }
  }

  // -- methods --------------------------------------------------------------

  private async onMessageSend(res: ServerResponse, rpc: JsonRpcRequest): Promise<void> {
    const { message } = rpc.params as MessageSendParams;
    if (!message || message.kind !== "message") {
      return this.rpcError(res, rpc.id, ERROR.invalidParams, "params.message is required");
    }
    const task = this.startTask(message);
    await this.execute(task, message);
    // Blocking send returns the final task snapshot.
    return this.json(res, 200, { jsonrpc: "2.0", id: rpc.id, result: this.store.get(task.id) });
  }

  private async onMessageStream(res: ServerResponse, rpc: JsonRpcRequest): Promise<void> {
    const { message } = rpc.params as MessageSendParams;
    if (!message || message.kind !== "message") {
      return this.rpcError(res, rpc.id, ERROR.invalidParams, "params.message is required");
    }
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
    });
    const task = this.startTask(message);
    // Emit the initial task, then stream every update until terminal.
    writeSse(res, { jsonrpc: "2.0", id: rpc.id, result: task });
    const done = new Promise<void>((resolvePromise) => {
      const unsubscribe = this.store.subscribe(task.id, (update) => {
        writeSse(res, { jsonrpc: "2.0", id: rpc.id, result: update });
        if (update.final) {
          unsubscribe();
          resolvePromise();
        }
      });
    });
    await this.execute(task, message);
    await done;
    res.end();
  }

  private onTasksGet(res: ServerResponse, rpc: JsonRpcRequest): void {
    const { id } = rpc.params as TaskIdParams;
    const task = this.store.get(id);
    if (!task) return this.rpcError(res, rpc.id, ERROR.taskNotFound, `Task not found: ${id}`);
    this.json(res, 200, { jsonrpc: "2.0", id: rpc.id, result: task });
  }

  private onTasksCancel(res: ServerResponse, rpc: JsonRpcRequest): void {
    const { id } = rpc.params as TaskIdParams;
    try {
      const task = this.store.cancel(id);
      this.json(res, 200, { jsonrpc: "2.0", id: rpc.id, result: task });
    } catch (e) {
      const msg = (e as Error).message;
      const code = msg.includes("not found") ? ERROR.taskNotFound : ERROR.taskNotCancelable;
      this.rpcError(res, rpc.id, code, msg);
    }
  }

  // -- execution ------------------------------------------------------------

  private startTask(message: Message): Task {
    const contextId = message.contextId ?? newId("ctx");
    return this.store.create(contextId, { ...message, contextId });
  }

  private async execute(task: Task, message: Message): Promise<void> {
    this.store.transition(task.id, "working");
    try {
      const output = await this.opts.executor.run(this.opts.def, collectText(message.parts));
      const artifact: Artifact = {
        artifactId: newId("artifact"),
        name: `${this.opts.def.key}-result`,
        parts: [{ kind: "text", text: output }],
      };
      this.store.addArtifact(task.id, artifact);
      this.store.transition(task.id, "completed");
    } catch (e) {
      this.store.transition(task.id, "failed", {
        kind: "message",
        role: "agent",
        parts: [{ kind: "text", text: (e as Error).message }],
        messageId: newId("msg"),
        taskId: task.id,
      });
    }
  }

  // -- response helpers -----------------------------------------------------

  private json(res: ServerResponse, status: number, body: unknown): void {
    const payload = JSON.stringify(body);
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(payload);
  }

  private rpcError(
    res: ServerResponse,
    id: string | number | null,
    code: number,
    message: string,
  ): void {
    const body: JsonRpcError = { jsonrpc: "2.0", id, error: { code, message } };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolvePromise(data));
    req.on("error", reject);
  });
}

function writeSse(res: ServerResponse, payload: unknown): void {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}
