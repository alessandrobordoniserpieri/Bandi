// Smoke test for the Task 4 profile UI primitives.
//
// The brief's original smoke test used JSX + renderToStaticMarkup
// (see task-4-brief.md Step 6), in a `.tsx` test file. This repo's
// vitest.config.ts `test.include` glob is `src/**/__tests__/**/*.test.ts`,
// which does not match a `.test.tsx` filename, so a JSX-based test never
// gets discovered by `vitest run` (a harness/config gap, not a component
// bug — verified: with the glob patched locally to also match `.test.tsx`,
// the original renderToStaticMarkup test does pass). Per the task
// instructions, falling back to asserting the components are defined
// functions rather than editing vitest.config.ts (out of scope for this
// commit, which is restricted to app/src/components/profile/).
import { describe, it, expect } from "vitest";
import { TextField, SelectField, TextArea, CheckboxField, MultiCheckbox, Row } from "../fields";
import { CompletionBar } from "../completion-bar";
import { SectionIdentity } from "../section-identity";
import { SectionTerritory } from "../section-territory";
import { SectionThemes } from "../section-themes";

describe("profile UI primitives are defined", () => {
  it("fields.tsx exports the expected components", () => {
    expect(typeof TextField).toBe("function");
    expect(typeof SelectField).toBe("function");
    expect(typeof TextArea).toBe("function");
    expect(typeof CheckboxField).toBe("function");
    expect(typeof MultiCheckbox).toBe("function");
    expect(typeof Row).toBe("function");
  });

  it("completion-bar.tsx exports CompletionBar", () => {
    expect(typeof CompletionBar).toBe("function");
  });

  it("section components 1-3 are defined", () => {
    expect(typeof SectionIdentity).toBe("function");
    expect(typeof SectionTerritory).toBe("function");
    expect(typeof SectionThemes).toBe("function");
  });
});
