# PaperWeave product direction

Date: 2026-08-10

This decision consolidates the visible ChatGPT/Codex project conversations, all local worktrees, the GitHub repository, the current source, tests, and two rounds of ChatGPT Pro review.

## Binding decision

**Contract and locally refactor; do not continue the old roadmap and do not rewrite the technical base.**

PaperWeave is an **Evidence-first PDF Reader** for people who repeatedly read papers and must form their own defensible judgment.

JTBD:

> Help me build a traceable, verifiable judgment from one paper.

Competitive wedge:

> Typical AI readers output summaries. PaperWeave outputs why the user believes a conclusion.

The product is not an AI workspace, second brain, RAG system, agent platform, or automatic literature-review writer.

## v0.1 scope

Must have:

1. Real local PDF import and reading.
2. Evidence Anchors that return to the correct PDF location.
3. A Claim review lifecycle with Accept, Edit, and Reject.
4. User-owned structured judgment notes.
5. AI that may create Draft Claims only; it must never bypass human review.

Explicitly out of scope:

- Discover and automatic reading packs
- Zotero
- Git/GitHub product sync
- Knowledge graph and cross-paper synthesis
- RAG, agents, collaboration, and cloud sync
- Automatic reviews or paper writing

## Technical direction

Keep:

- Tauri 2 and the Rust command boundary
- React 18, Vite, and TypeScript
- PDF.js
- SQLite and the content-addressed PDF vault
- Browser/Tauri repository implementations
- Anchor validation and the review state machine

Do not migrate to Electron or Next.js, replace Rust with TypeScript, replace SQLite with a cloud database, replace PDF.js, or split the current app into a monorepo.

The future minimum evidence model is:

```text
Paper 1 ── N PaperVersion 1 ── N EvidenceAnchor
Claim 1 ── N EvidenceLink N ── 1 EvidenceAnchor
```

`EvidenceLink.relation` must support `support`, `counter`, `qualify`, and `context`. That migration is not part of Phase 1.

## AI direction after the baseline

The desktop app exposes one provider shape: OpenAI-compatible Chat Completions. The user supplies the Base URL, API key, and model ID; PaperWeave stores the key in app-local configuration, excludes it from workspace snapshots and exports, and reuses it until the user replaces or clears it in Settings. The model list may be loaded from `/models` or entered manually.

Only the selected Evidence Anchor text and paper title are sent when the user explicitly requests an AI Draft. The complete PDF is not uploaded by this path. Returned JSON is validated and persisted only as evidence-bound Draft Claims with a `modelRunId`; it cannot create a Verified Claim or write “My Judgment.”

On provider failure:

```text
Keep the Anchor → create no Draft → show Provider unavailable → keep manual reading usable
```

There is no mock, fixture fallback, or silent provider fallback.

## Six-week validation sequence

1. Establish one truthful baseline and remove fake product entrances.
2. Stabilize real PDF, Anchor, highlight, return, and persistence behavior.
3. Complete the Claim lifecycle and evidence relations.
4. Add the single OpenAI Draft provider without bypassing review.
5. Complete the structured `Evidence → Judgment` note flow.
6. Test ten real papers with at least three real users.

The highest-risk product assumption is that users will repeatedly maintain an Evidence Ledger. The cheapest validation is to observe five research users reading three papers each and see whether they voluntarily Accept, Edit, Reject, and revisit Claims. If they do not, the product must contract again instead of adding features.

## Phase 1 definition

Phase 1 is complete when:

- the runtime navigation is only Library, Reader, and Settings;
- Library contains only real locally imported PDFs;
- Reader has no synthetic document, fixture Q&A, Zotero, sync, Discover, Knowledge, or Agent entrance;
- existing PDF, Anchor, local persistence, and explicit review-fixture tests still pass;
- the full TypeScript, Vitest, Vite, Rust test, and Clippy checks pass.

Phase 1 produces an **Internal Alpha Baseline**, not v0.1.
