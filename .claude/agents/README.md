# Team di agenti — Redesign FE "Bandi"

Infrastruttura di agenti per implementare il redesign descritto in
[`docs/redesign-ui-ux-concept.md`](../../docs/redesign-ui-ux-concept.md).
Ogni agente ha skill **obbligatorie** scritte nel proprio prompt: nessuno sceglie a caso quali
usare. Regola imposta dallo stakeholder:

- **superpowers** è tassativa per **scrivere codice, testare, fare review e documentazione**.
- Per **UI / FE / craft / efficienza** si usano le skill di design accumulate: `impeccable`,
  `design`, `dataviz`, `web-artifacts-builder`, `prototype`, `domain-modeling`.

## Agenti

| Agente | Ruolo | Skill obbligatorie |
|--------|-------|--------------------|
| **fe-builder** | Implementa componenti/route nel codice reale | `superpowers:test-driven-development`, `superpowers:systematic-debugging`, `superpowers:verification-before-completion`, `impeccable:impeccable`, `dataviz`, `design:accessibility` |
| **design-reviewer** | Gate di qualità visivo + a11y + code-review | `superpowers:requesting-code-review`, `superpowers:receiving-code-review`, `impeccable:impeccable` (audit/critique), `design:critique`, `design:accessibility` |
| **fe-test-engineer** | Test suite (vitest), copertura, regressioni | `superpowers:test-driven-development`, `superpowers:verification-before-completion`, `superpowers:systematic-debugging` |
| **fe-prototyper** | Mockup usa-e-getta per schermate incerte | `web-artifacts-builder`, `mattpocock-skills:prototype`, `impeccable:impeccable` |
| **fe-docs-writer** | Documentazione + vocabolario UI univoco | `superpowers:writing-plans`, `superpowers:executing-plans`, `superpowers:verification-before-completion`, `mattpocock-skills:domain-modeling` |

## Flusso di lavoro

```
docs/redesign-ui-ux-concept.md  (14 decisioni confermate — fonte di verità)
        │
        ▼
[fe-prototyper]  (solo per schermate incerte: Kanban DEC-2, dettaglio DEC-10)
        │  mockup validato
        ▼
[fe-builder] ◀──▶ [fe-test-engineer]   (TDD: test rosso → codice → refactor)
        │  schermata implementata + stati loading/error/empty
        ▼
[design-reviewer]   (impeccable audit + design:critique + design:accessibility + code-review)
        │  blocca finché non passa la Definition of Done
        ▼
[fe-docs-writer]   (aggiorna concept doc, vocabolario, changelog)
```

## Definition of Done (per schermata)

1. `impeccable audit` pulito (nessun anti-pattern bloccante).
2. `design:accessibility` AA, nessuna regressione sui punti di forza esistenti.
3. Stati `loading` / `error` / `empty` presenti (concept §6.1).
4. Nessun token grezzo o termine sovraccaricato a schermo (concept §6.3).
5. Test scritti prima e verdi (`cd app && npm test`).
6. `superpowers:verification-before-completion` superata.

## Marketplace/plugin richiesti (installazione una tantum)

```bash
claude plugin marketplace add obra/superpowers-marketplace
claude plugin install superpowers@superpowers-marketplace
claude plugin marketplace add pbakaus/impeccable
claude plugin install impeccable@impeccable
claude plugin marketplace add mattpocock/skills
claude plugin install mattpocock-skills@mattpocock
# plugin "design" (knowledge-work-plugins) già abilitato sull'account
# skill "dataviz" e "web-artifacts-builder": abilitate a livello account
```

> Nota: il repo dichiarava `superpowers@superpowers-dev` (branch dev di obra/superpowers) in
> `.claude/settings.json`, ma quel marketplace non è in cache in questo ambiente. La versione
> effettivamente usata è la stabile `superpowers@superpowers-marketplace` (6.1.1).

## Come invocarli

Gli agenti sono definiti come file in `.claude/agents/*.md` e si lanciano con il tool `Agent`
(`subagent_type: "fe-builder"`, ecc.). Ciascuno carica da solo le proprie skill obbligatorie
tramite il tool `Skill`; non serve ricordarglielo a mano.
