// The five FE-redesign agents, described as A2A agents. Each entry maps 1:1 to a
// role definition in `.claude/agents/*.md` (the file whose system prompt the
// Claude-backed executor runs) and declares the Claude skills that role MUST use.
//
// The mandated skills are surfaced in the A2A Agent Card (as skill tags) so the
// requirement is visible in the discovery document, and they are re-asserted in
// the executor's system prompt so a real run actually loads them.

import type { AgentCard, AgentSkill } from "./protocol.ts";

export interface AgentDef {
  /** Stable key, also the port offset and the `.claude/agents/<key>.md` basename. */
  key: string;
  name: string;
  description: string;
  /** Default TCP port for this agent's A2A server. */
  port: number;
  /** Claude skills this role is REQUIRED to use (plugin:skill form). */
  mandatedSkills: string[];
  /** A2A skills this agent exposes to peers. */
  skills: AgentSkill[];
  /** Peers this agent hands off to, by key (drives the orchestrated flow). */
  handoffTo: string[];
}

const PROTOCOL_VERSION = "0.2.0";
const VERSION = "1.0.0";

export const AGENT_DEFS: AgentDef[] = [
  {
    key: "fe-builder",
    name: "FE Builder",
    description:
      "Implements the redesign in the real Next.js 16 / React 19 codebase, test-first, with impeccable craft.",
    port: 4101,
    mandatedSkills: [
      "superpowers:test-driven-development",
      "superpowers:systematic-debugging",
      "superpowers:verification-before-completion",
      "impeccable:impeccable",
      "dataviz",
      "design:accessibility",
    ],
    skills: [
      {
        id: "implement-screen",
        name: "Implement a screen",
        description:
          "Build a component/route from a confirmed decision in docs/redesign-ui-ux-concept.md, with loading/error/empty states.",
        tags: ["frontend", "nextjs", "react", "tailwind", "tdd", "impeccable"],
        examples: ["Implement the global sidebar (DEC-3)"],
      },
    ],
    handoffTo: ["fe-test-engineer", "design-reviewer"],
  },
  {
    key: "design-reviewer",
    name: "Design Reviewer",
    description:
      "Quality gate: reviews each delivered screen for visual craft, accessibility, and code-review, and blocks until it passes.",
    port: 4102,
    mandatedSkills: [
      "superpowers:requesting-code-review",
      "superpowers:receiving-code-review",
      "impeccable:impeccable",
      "design:critique",
      "design:accessibility",
    ],
    skills: [
      {
        id: "review-screen",
        name: "Review a screen",
        description:
          "Run impeccable audit + design:critique + design:accessibility + code-review against a delivered screen; report blocking vs nice-to-have.",
        tags: ["review", "accessibility", "impeccable", "code-review"],
        examples: ["Review the sidebar implementation before it is marked done"],
      },
    ],
    handoffTo: ["fe-docs-writer"],
  },
  {
    key: "fe-test-engineer",
    name: "FE Test Engineer",
    description:
      "Owns correctness through tests (vitest); drives the red step in TDD and gates on verification.",
    port: 4103,
    mandatedSkills: [
      "superpowers:test-driven-development",
      "superpowers:verification-before-completion",
      "superpowers:systematic-debugging",
    ],
    skills: [
      {
        id: "cover-behaviour",
        name: "Cover behaviour with tests",
        description:
          "Write failing-first tests for a seam the redesign touches, then verify the suite is green.",
        tags: ["testing", "vitest", "tdd"],
        examples: ["Cover the unified grants-list novita filter (DEC-1)"],
      },
    ],
    handoffTo: ["fe-builder"],
  },
  {
    key: "fe-prototyper",
    name: "FE Prototyper",
    description:
      "Builds throwaway, navigable prototypes to resolve an uncertain screen before it is built for real.",
    port: 4104,
    mandatedSkills: [
      "web-artifacts-builder",
      "mattpocock-skills:prototype",
      "impeccable:impeccable",
    ],
    skills: [
      {
        id: "prototype-screen",
        name: "Prototype a screen",
        description:
          "Produce a navigable mockup (React+Tailwind+shadcn) of an uncertain screen for validation before real code.",
        tags: ["prototype", "mockup", "impeccable", "web-artifacts-builder"],
        examples: ["Prototype the Kanban card/board redesign (DEC-2)"],
      },
    ],
    handoffTo: ["fe-builder"],
  },
  {
    key: "fe-docs-writer",
    name: "FE Docs Writer",
    description:
      "Keeps the redesign docs and the product's shared vocabulary current, and records what actually shipped.",
    port: 4105,
    mandatedSkills: [
      "superpowers:writing-plans",
      "superpowers:executing-plans",
      "superpowers:verification-before-completion",
      "mattpocock-skills:domain-modeling",
    ],
    skills: [
      {
        id: "document-change",
        name: "Document a change",
        description:
          "Update docs/redesign-ui-ux-concept.md and the UI vocabulary to match what shipped, keeping DEC-n ids stable.",
        tags: ["documentation", "domain-modeling", "vocabulary"],
        examples: ["Document the shipped sidebar and its states"],
      },
    ],
    handoffTo: [],
  },
];

export function agentByKey(key: string): AgentDef {
  const def = AGENT_DEFS.find((d) => d.key === key);
  if (!def) throw new Error(`Unknown agent key: ${key}`);
  return def;
}

/** Build the A2A Agent Card for a role, given the base URL it is served from. */
export function buildAgentCard(def: AgentDef, baseUrl: string): AgentCard {
  return {
    protocolVersion: PROTOCOL_VERSION,
    name: def.name,
    description: def.description,
    url: baseUrl,
    version: VERSION,
    provider: { organization: "Bandi redesign team" },
    capabilities: {
      streaming: true,
      pushNotifications: false,
      stateTransitionHistory: true,
    },
    defaultInputModes: ["text/plain"],
    defaultOutputModes: ["text/plain"],
    // Expose the mandated Claude skills as an extra discovery skill so peers can
    // see, in the card itself, which skills this role is bound to use.
    skills: [
      ...def.skills,
      {
        id: "mandated-skills",
        name: "Mandated Claude skills",
        description:
          "Skills this agent is required to load when doing its work: " +
          def.mandatedSkills.join(", "),
        tags: ["mandated-skills", ...def.mandatedSkills],
      },
    ],
  };
}
