---
target: app auth pages + design system
total_score: 21
p0_count: 2
p1_count: 2
timestamp: 2026-07-09T07-50-14Z
slug: app-src-app-auth-login-page-tsx
---
Method: dual-agent (A: design review · B: detector + browser evidence)

## Design Health Score
| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2/4 | No "last updated" signal on grant feed |
| 2 | Match System/Real World | 3/4 | Good Italian ETS vocabulary, translated errors |
| 3 | User Control and Freedom | 2/4 | No password-reset flow anywhere in codebase |
| 4 | Consistency and Standards | 3/4 | Duplicated inline styles in grant detail |
| 5 | Error Prevention | 2/4 | Only native HTML validation on auth forms |
| 6 | Recognition Rather Than Recall | 3/4 | Text-labeled nav, labeled badges |
| 7 | Flexibility and Efficiency | 1/4 | No shortcuts, no bulk actions |
| 8 | Aesthetic and Minimalist Design | 2/4 | Disciplined elsewhere, auth pages generic |
| 9 | Error Recovery | 3/4 | Good error copy, no recovery path |
| 10 | Help and Documentation | 0/4 | No help surface found |
| **Total** | | **21/40** | **Acceptable, low end of band** |

## Anti-Patterns Verdict
LLM: auth pages are the exact "generic centered white card" AI-slop archetype the skill bans; rest of system (badges, dialog state machine) is disciplined, not templated.
Detector: static scan found 1 finding (layout-transition, globals.css:266, minor). Live browser-injected detector independently flagged flat-type-hierarchy on both auth pages (13/14/16/24px, 1.8:1 ratio) — corroborates LLM verdict on the same two pages.
Layout bug (measured): auth-card overflows 16px past viewport at 390px width, border/radius clipped.

## Priority Issues
[P0] Filter-bar checkboxes unreachable by keyboard/screen reader — `.filter-chip input { display:none }` in globals.css strips from tab order and a11y tree.
[P0] Core signal colors fail WCAG AA — verdict badge "Candidabile" 4.27:1, "gia_candidato" 4.38:1 (need 4.5:1); --border token 1.33:1 (need 3:1 for non-text UI boundaries).
[P1] Auth pages are unbranded SaaS-template slop, corroborated by live detector; mobile viewport overflow bug confirmed (390px, 16px clip).
[P1] No password-reset flow exists (grep confirmed empty across src).
[P2] Grant card doesn't execute PRODUCT.md's "score-first hierarchy" principle — score same visual weight as surrounding badges.

## Persona Red Flags
Alex: no shortcuts, no bulk save, no remember-me/SSO.
Sam: filter checkboxes unreachable, verdict badge under contrast floor, input/card borders near-invisible at 1.33:1, no skip-link before nav.
