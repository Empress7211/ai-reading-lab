# PaperWeave

PaperWeave is an **evidence-first local PDF reader**. It helps a person turn one paper into a traceable, reviewable judgment—not a general research workspace, knowledge base, or autonomous agent.

Status: **0.1.0 unsigned macOS local RC (Internal Alpha)**. The complete offline workflow remains usable without an API key. The desktop app also supports opt-in OpenAI-compatible AI features. Developer ID signing and notarization remain deliberately deferred.

## What works now

- Import a real local PDF.
- Edit its local title, authors, and year for search and export.
- Render it with PDF.js.
- Create an Evidence Anchor from selected text and return to its PDF location.
- Persist PDFs in a local content-addressed vault and entities in SQLite in Tauri.
- Use IndexedDB for the browser development runtime.
- Create a manual Draft from an Anchor with an explicit support, counter, qualify, or context relationship.
- Store EvidenceLink, Draft, ReviewAction, and Verified Claim as separate entities.
- Accept, edit and accept, or reject each Draft through the real review state machine.
- Write a six-section user-owned Judgment that can cite only Verified Claims and jump back to the PDF.
- Export deterministic Markdown from reviewed evidence without exporting the PDF or its local path.
- Configure an OpenAI-compatible Base URL, API Key, and model ID in Settings.
- Save the API Key once in PaperWeave's local app configuration so later AI requests can use it without a macOS Keychain prompt; it is excluded from workspace snapshots and exports.
- Load compatible model IDs from `/models`, or enter one manually.
- Generate evidence-bound AI Drafts through `/chat/completions`; generated Drafts keep a `modelRunId` and still require human Accept, Edit, or Reject.
- Generate an experimental, single-paper Paper Map after explicitly confirming the structured full-text request; its AI output is unreviewed navigation assistance and cannot create a Verified Claim or Judgment.
- Build and verify an unsigned local `.app` and `.dmg` without requiring an Apple signing identity.

No fake AI result is generated at runtime. Provider, transport, JSON, or validation failures create no Draft and are shown explicitly; the manual workflow remains available. Browser development mode does not accept or store API keys.

## What is intentionally absent

- Discover or automatic reading packs
- Synthetic papers or fixture Q&A
- Zotero integration
- Git/GitHub product sync
- Knowledge graph or cross-paper synthesis
- RAG, agents, collaboration, or cloud sync
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

The release commands intentionally produce unsigned RC artifacts for local/internal acceptance. Apple signing is not needed for development or internal acceptance and can be added only when distribution requires it.

## Architecture kept as the product base

```text
React
  ↓
WorkspaceRepository
  ↓
Tauri command boundary
  ↓
Rust
  ├─ SQLite + content-addressed PDF vault
  ├─ local provider configuration
  └─ user-configured OpenAI-compatible endpoint
```

This baseline intentionally keeps Tauri 2, Rust, React/Vite/TypeScript, PDF.js, SQLite, the repository abstraction, Anchor validation, and the review state machine.

The binding product decisions and six-week scope are recorded in [PRODUCT_DIRECTION.md](PRODUCT_DIRECTION.md).
