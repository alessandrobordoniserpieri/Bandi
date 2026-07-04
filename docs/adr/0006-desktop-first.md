# ADR-006 — Desktop-first, responsive for mobile

## Status
Accepted (branch 005).

## Context
The "evaluate and act" moment — reading a grant PDF, analyzing the score
breakdown, filling the profile — is a desktop activity. Mobile serves fast
discovery: scrolling the dashboard, saving grants.

## Decision
Design desktop-first (readable at 1280px), responsive down to 375px without
breaking. Rich interactions (score breakdown, grant detail, profile forms) are
optimized for desktop; the list/discovery views must remain usable on mobile.

## Consequences
- Layout work prioritizes the desktop detail/breakdown view.
- Components use semantic, flowing markup so they degrade gracefully on small
  screens (no fixed widths that force horizontal scroll at 375px).
- Heavy responsive polish is deferred; the invariant is only that no view
  overflows or breaks its layout at 375px.
