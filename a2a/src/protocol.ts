// A2A (Agent2Agent) protocol types — a faithful subset of the open A2A spec.
// Transport is JSON-RPC 2.0 over HTTP; discovery is a JSON Agent Card served at
// `/.well-known/agent-card.json`. See https://a2a-protocol.org for the full spec.
//
// This module is pure types + a few small helpers — no I/O.

// ---------------------------------------------------------------------------
// Agent Card (discovery document)
// ---------------------------------------------------------------------------

export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  tags: string[];
  examples?: string[];
}

export interface AgentCapabilities {
  streaming: boolean;
  pushNotifications: boolean;
  stateTransitionHistory: boolean;
}

export interface AgentCard {
  /** Protocol version this card conforms to. */
  protocolVersion: string;
  name: string;
  description: string;
  /** Base URL where this agent's A2A JSON-RPC endpoint is reachable. */
  url: string;
  version: string;
  provider?: { organization: string; url?: string };
  capabilities: AgentCapabilities;
  defaultInputModes: string[];
  defaultOutputModes: string[];
  skills: AgentSkill[];
}

// ---------------------------------------------------------------------------
// Messages, Parts, Artifacts
// ---------------------------------------------------------------------------

export interface TextPart {
  kind: "text";
  text: string;
}

/** A data part carries structured JSON (used here for hand-off metadata). */
export interface DataPart {
  kind: "data";
  data: Record<string, unknown>;
}

export type Part = TextPart | DataPart;

export interface Message {
  kind: "message";
  role: "user" | "agent";
  parts: Part[];
  messageId: string;
  /** Set when this message belongs to an existing task. */
  taskId?: string;
  /** Groups related tasks/messages into one conversation. */
  contextId?: string;
}

export interface Artifact {
  artifactId: string;
  name?: string;
  description?: string;
  parts: Part[];
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export type TaskState =
  | "submitted"
  | "working"
  | "input-required"
  | "completed"
  | "canceled"
  | "failed"
  | "rejected";

export const TERMINAL_STATES: ReadonlySet<TaskState> = new Set<TaskState>([
  "completed",
  "canceled",
  "failed",
  "rejected",
]);

export interface TaskStatus {
  state: TaskState;
  /** Optional agent message accompanying the state (e.g. why it failed). */
  message?: Message;
  /** ISO-8601 timestamp of when this state was entered. */
  timestamp: string;
}

export interface Task {
  kind: "task";
  id: string;
  contextId: string;
  status: TaskStatus;
  artifacts?: Artifact[];
  /** Full message history when the agent advertises stateTransitionHistory. */
  history?: Message[];
}

// ---------------------------------------------------------------------------
// JSON-RPC 2.0 envelopes
// ---------------------------------------------------------------------------

export interface JsonRpcRequest<P = unknown> {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params: P;
}

export interface JsonRpcSuccess<R = unknown> {
  jsonrpc: "2.0";
  id: string | number;
  result: R;
}

export interface JsonRpcError {
  jsonrpc: "2.0";
  id: string | number | null;
  error: { code: number; message: string; data?: unknown };
}

export type JsonRpcResponse<R = unknown> = JsonRpcSuccess<R> | JsonRpcError;

// A2A JSON-RPC method names.
export const A2A_METHODS = {
  messageSend: "message/send",
  messageStream: "message/stream",
  tasksGet: "tasks/get",
  tasksCancel: "tasks/cancel",
} as const;

// A2A / JSON-RPC error codes (subset).
export const ERROR = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internal: -32603,
  taskNotFound: -32001,
  taskNotCancelable: -32002,
} as const;

// ---------------------------------------------------------------------------
// Method params
// ---------------------------------------------------------------------------

export interface MessageSendParams {
  message: Message;
  configuration?: { blocking?: boolean };
}

export interface TaskIdParams {
  id: string;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

let counter = 0;
export function newId(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}`;
}

export function textMessage(
  role: "user" | "agent",
  text: string,
  extra: Partial<Message> = {},
): Message {
  return {
    kind: "message",
    role,
    parts: [{ kind: "text", text }],
    messageId: newId("msg"),
    ...extra,
  };
}

/** Concatenate all text parts of a message or artifact. */
export function collectText(parts: Part[]): string {
  return parts
    .filter((p): p is TextPart => p.kind === "text")
    .map((p) => p.text)
    .join("\n");
}
