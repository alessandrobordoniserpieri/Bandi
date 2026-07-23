// In-memory task store with a simple subscriber model so the server can stream
// (message/stream) status/artifact updates over SSE. One store per agent server.

import {
  type Artifact,
  type Message,
  type Task,
  type TaskState,
  type TaskStatus,
  TERMINAL_STATES,
  newId,
} from "./protocol.ts";

export interface TaskUpdate {
  taskId: string;
  status?: TaskStatus;
  artifact?: Artifact;
  /** True on the last update for a task (terminal state reached). */
  final: boolean;
}

type Subscriber = (update: TaskUpdate) => void;

export class TaskStore {
  private tasks = new Map<string, Task>();
  private subscribers = new Map<string, Set<Subscriber>>();

  create(contextId: string, first: Message): Task {
    const id = newId("task");
    const task: Task = {
      kind: "task",
      id,
      contextId,
      status: { state: "submitted", timestamp: now() },
      artifacts: [],
      history: [first],
    };
    this.tasks.set(id, task);
    return task;
  }

  get(id: string): Task | undefined {
    return this.tasks.get(id);
  }

  transition(id: string, state: TaskState, message?: Message): void {
    const task = this.mustGet(id);
    task.status = { state, message, timestamp: now() };
    if (message) task.history?.push(message);
    this.emit({ taskId: id, status: task.status, final: TERMINAL_STATES.has(state) });
  }

  addArtifact(id: string, artifact: Artifact): void {
    const task = this.mustGet(id);
    (task.artifacts ??= []).push(artifact);
    this.emit({ taskId: id, artifact, final: false });
  }

  cancel(id: string): Task {
    const task = this.mustGet(id);
    if (TERMINAL_STATES.has(task.status.state)) {
      throw new Error(`Task ${id} is already ${task.status.state}`);
    }
    this.transition(id, "canceled");
    return this.mustGet(id);
  }

  subscribe(id: string, sub: Subscriber): () => void {
    let set = this.subscribers.get(id);
    if (!set) {
      set = new Set();
      this.subscribers.set(id, set);
    }
    set.add(sub);
    return () => set!.delete(sub);
  }

  private emit(update: TaskUpdate): void {
    this.subscribers.get(update.taskId)?.forEach((sub) => sub(update));
  }

  private mustGet(id: string): Task {
    const task = this.tasks.get(id);
    if (!task) throw new Error(`Task not found: ${id}`);
    return task;
  }
}

function now(): string {
  return new Date().toISOString();
}
