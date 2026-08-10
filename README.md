# PaperWeave

PaperWeave is an **evidence-first local PDF reader**. It helps a person turn one paper into a traceable, reviewable judgment—not a general research workspace, knowledge base, or autonomous agent.

Status: **v0.1 unsigned macOS release candidate**. The complete offline workflow is usable without an API key. Developer ID signing, notarization, and the real OpenAI adapter are deliberately deferred.

## What works now

- Import a real local PDF.
- Render it with PDF.js.
- Create an Evidence Anchor from selected text and return to its PDF location.
- Persist PDFs in a local content-addressed vault and entities in SQLite in Tauri.
- Use IndexedDB for the browser development runtime.
- Create a manual Draft from an Anchor with an explicit support, counter, qualify, or context relationship.
- Store EvidenceLink, Draft, ReviewAction, and Verified Claim as separate entities.
- Accept, edit and accept, or reject each Draft through the real review state machine.
- Write a six-section user-owned Judgment that can cite only Verified Claims and jump back to the PDF.
- Export deterministic Markdown from reviewed evidence without exporting the PDF or its local path.
- Build and verify an unsigned local `.app` and `.dmg` without requiring an Apple signing identity.

No fake AI result is generated at runtime. The OpenAI credential and generation ports remain in the repository boundary, but calling them currently fails with an explicit deferred-adapter error.

## What is intentionally absent

- Discover or automatic reading packs
- Synthetic papers or fixture Q&A
- Zotero integration
- Git/GitHub product sync
- Knowledge graph or cross-paper synthesis
- RAG, agents, collaboration, or cloud sync
- A configured AI provider or API-key storage implementation
- Developer ID signing, notarization, or App Store submission

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
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

For the desktop app:

```bash
pnpm tauri dev
./script/build_and_run.sh --verify
pnpm run release:build:macos
pnpm run release:verify:macos
```

The release commands intentionally use unsigned local-RC mode. Apple signing is not needed for development or local acceptance and can be added only when distribution requires it.

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
