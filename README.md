# PaperWeave

PaperWeave is an **evidence-first local PDF reader**. Its job is to help a person turn one paper into a traceable, reviewable judgment—not to act as a general research workspace, knowledge base, or autonomous agent.

Status: **Internal Alpha Baseline**. This repository is runnable, but it is not yet product v0.1.

## What works now

- Import a real local PDF.
- Render it with PDF.js.
- Create an Evidence Anchor from selected text and return to its PDF location.
- Persist PDFs in a local content-addressed vault and entities in SQLite in Tauri.
- Use IndexedDB as the browser development fallback.
- Persist user notes separately from Draft and Verified Claims.
- Exercise Accept / Edit / Reject through the real review state machine.

The three generated review Drafts are deliberately labeled fixtures. They validate persistence and review semantics only; no model is called and they are not presented as paper facts.

## What is intentionally absent

- Discover or automatic reading packs
- Synthetic papers or fixture Q&A
- Zotero integration
- Git/GitHub product sync
- Knowledge graph or cross-paper synthesis
- RAG, agents, collaboration, or cloud sync
- A configured AI provider

The current product path is deliberately narrow:

```text
Library → Import PDF → Reader → Anchor → Review → My judgment
```

## Run and verify

```bash
pnpm install
pnpm dev
pnpm typecheck
pnpm test
pnpm build
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
```

For the desktop app:

```bash
pnpm tauri dev
pnpm run release:build:macos
pnpm run release:verify:macos
```

The unsigned macOS app/DMG is for local acceptance only; Developer ID signing and notarization are not configured.

## Architecture kept as the product base

```text
React
  ↓
WorkspaceRepository
  ↓
Tauri command boundary
  ↓
Rust
  ↓
SQLite + content-addressed PDF vault
```

This baseline intentionally keeps Tauri 2, Rust, React/Vite/TypeScript, PDF.js, SQLite, the repository abstraction, Anchor validation, and the review state machine.

The binding product decisions and six-week scope are recorded in [PRODUCT_DIRECTION.md](PRODUCT_DIRECTION.md).
