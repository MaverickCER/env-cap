# Open-standard configuration alignment generator

Generates `docs/ISO-10007-2017.md` and `docs/ISO-IEC-27001-2022.md` — non-normative reports mapping this app's own, already-gathered evidence (via `env-cap`'s three published reference evidence projections, `env-cap/build`) against the published process/control-theme STRUCTURE of two copyrighted ISO standards, without ever quoting or reproducing either standard's own text.

## Why no single open substrate covers both target documents

Unlike `repo-contract`'s OpenSSF Scorecard pilot and `data-cap`'s NIST Privacy Framework substrate (each a single open, freely-reusable methodology mapping to a single target document), env-cap's two target documents cover genuinely different subject areas — configuration management process (ISO 10007) and information security management (ISO/IEC 27001) — and no single open specification's structure fits both. Two open, freely-reusable structures were used instead, each for the document it actually fits:

- **ISO 10007:2017**'s own published process structure (five named configuration management activities — planning, identification, change control, status accounting, audit) is used directly. This is the standard's own table-of-contents-level fact, not its protected explanatory text, corroborated across independent public summaries (ANSI's own blog coverage and multiple industry secondary sources) rather than the purchasable standard itself — see [`standard-map.ts`](standard-map.ts).
- **ISO/IEC 27001:2022**'s own published Annex A control-theme structure (four categories: Organizational, People, Physical, Technological — 93 controls total) is used the same way, corroborated across independent public summaries.

The [12-Factor App](https://12factor.net/) methodology (MIT-licensed) was researched as a candidate single substrate but not used as the primary structure here: its twelve factors describe *deployment practice*, not a process taxonomy that maps cleanly onto either target standard's own organization the way each standard's own structure does. `env-cap`'s real evidence (declared ownership, sensitivity, lifecycle) is genuinely relevant to Factor III ("Store config in the environment"), but forcing both target documents through a 12-factor lens would have been a weaker, less direct mapping than using each standard's own freely-summarizable structure.

## The evidentiary-traceability rule

Every "Evidence found" entry in both generated documents traces to a specific, named source: one of `env-cap`'s own published reference evidence projections, applied to this app's own generated `docs/env.evidence.json`. Every "No evidence" entry states, honestly, why this app's evidence has nothing to say about that item — most commonly because the item (personnel training, physical security, risk-tolerance determination) is an organizational concern outside what a source-controlled app's own environment-variable contract can establish.

## Architecture

```text
env-cap's own reference projections (configurationReference, ownershipSummary, expiringSoonReport)
  applied to docs/env.evidence.json
  -> gather-evidence.ts (maps each fact to an ISO 10007 activity / Annex A category, or records "no evidence" honestly)
  -> render-markdown.ts (renders both disclaimer-carrying documents)
  -> run.ts (writes docs/ISO-10007-2017.md and docs/ISO-IEC-27001-2022.md)
```

Run via `npm run docs:alignment` (chains `npm run docs` first so the evidence file is always current) or `npm run build` (which chains it too).
