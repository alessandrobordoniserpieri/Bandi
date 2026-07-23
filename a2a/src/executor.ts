// An Executor turns an incoming task (a user message) into an artifact. It is the
// "brain" behind an A2A agent server — the A2A layer is pure transport, the
// executor does the actual work.
//
// Two implementations:
//   - ClaudeCliExecutor: runs `claude -p` headless with the role's system prompt
//     from `.claude/agents/<key>.md`, so the mandated skills (superpowers, Pocock,
//     impeccable, design, dataviz — installed at user scope) are loaded for real.
//   - MockExecutor: deterministic, offline; used by tests and the smoke run.

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentDef } from "./agent-defs.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");

export interface Executor {
  /** Produce the agent's textual result for one task. */
  run(def: AgentDef, prompt: string): Promise<string>;
}

/**
 * Reads the role's system prompt from `.claude/agents/<key>.md` (stripping the
 * YAML frontmatter) and prepends an explicit re-assertion of the mandated
 * skills, so a real Claude run cannot skip them.
 */
export async function loadRolePrompt(def: AgentDef): Promise<string> {
  const path = resolve(REPO_ROOT, ".claude", "agents", `${def.key}.md`);
  const raw = await readFile(path, "utf8");
  const body = stripFrontmatter(raw);
  const mandate =
    `You MUST use these skills for this work (they are installed and available): ` +
    def.mandatedSkills.join(", ") +
    `. Invoke each via the Skill tool as its role requires.`;
  return `${mandate}\n\n${body}`;
}

export function stripFrontmatter(md: string): string {
  if (md.startsWith("---")) {
    const end = md.indexOf("\n---", 3);
    if (end !== -1) return md.slice(md.indexOf("\n", end + 1) + 1).trimStart();
  }
  return md;
}

/** Runs the real Claude Code CLI headless. Requires `claude` on PATH. */
export class ClaudeCliExecutor implements Executor {
  constructor(
    private readonly opts: {
      claudeBin?: string;
      cwd?: string;
      timeoutMs?: number;
    } = {},
  ) {}

  async run(def: AgentDef, prompt: string): Promise<string> {
    const system = await loadRolePrompt(def);
    const bin = this.opts.claudeBin ?? "claude";
    const args = ["-p", prompt, "--append-system-prompt", system];
    return await new Promise<string>((resolvePromise, reject) => {
      const child = spawn(bin, args, {
        cwd: this.opts.cwd ?? REPO_ROOT,
        env: process.env,
      });
      let out = "";
      let err = "";
      const timer = setTimeout(
        () => {
          child.kill("SIGTERM");
          reject(new Error(`claude timed out after ${this.opts.timeoutMs ?? 600_000}ms`));
        },
        this.opts.timeoutMs ?? 600_000,
      );
      child.stdout.on("data", (d) => (out += d.toString()));
      child.stderr.on("data", (d) => (err += d.toString()));
      child.on("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) resolvePromise(out.trim());
        else reject(new Error(`claude exited ${code}: ${err.trim() || out.trim()}`));
      });
    });
  }
}

/**
 * Offline executor. Echoes a structured acknowledgement that names the role and
 * the skills it would load — enough to exercise the full A2A message/task/
 * artifact lifecycle and the orchestrated hand-offs without any network or LLM.
 */
export class MockExecutor implements Executor {
  async run(def: AgentDef, prompt: string): Promise<string> {
    return [
      `[${def.name}] handled the task using: ${def.mandatedSkills.join(", ")}.`,
      `Prompt: ${prompt}`,
    ].join("\n");
  }
}
