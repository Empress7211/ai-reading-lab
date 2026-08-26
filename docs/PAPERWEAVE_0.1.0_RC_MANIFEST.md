# PaperWeave 0.1.0 RC manifest

This manifest fixes the source and local macOS artifacts used for the
PaperWeave 0.1.0 internal dogfood RC. It records a reproducible unsigned build;
it is not evidence of Developer ID signing, notarization, or public release.

## Source identity

| Field | Value |
| --- | --- |
| Repository | `https://github.com/Empress7211/ai-reading-lab.git` |
| Branch | `main` |
| Artifact source commit | `cf553f0c6e94857b5f4846735c01cb0cfced5edc` |
| Source commit message | `fix: close PDF render window races` |
| Build source | Fresh clone of `origin/main`; `git status --short` was empty before and after the release build |

The artifact source commit contains the PDF render-window race repair, its
tests, and the nine-paper release gate. A later documentation-only commit may
carry this manifest; that does not change the artifact source commit above.

## Build environment

| Component | Version |
| --- | --- |
| Host | macOS 26.5.2 (`25F84`), arm64 |
| Node.js | `v24.19.0` |
| pnpm | `11.9.0`, matching `packageManager` |
| rustc | `1.97.1 (8bab26f4f 2026-07-14)` |
| cargo | `1.97.1 (c980f4866 2026-06-30)` |
| App target | arm64, macOS 11.0 minimum, macOS 26.5 SDK |

The clean build used:

```text
corepack pnpm release:build:macos
corepack pnpm release:verify:macos
```

`COREPACK_HOME` pointed to a temporary directory containing the exact
`pnpm@11.9.0` distribution.

## Validation gates

The source tree and the fresh clone both passed the release-relevant gates on
2026-08-26:

| Gate | Result |
| --- | --- |
| Frontend tests | PASS: 22 files, 108 tests |
| TypeScript typecheck | PASS |
| Production frontend build | PASS |
| Rust tests | PASS: 29 tests |
| Clippy | PASS with `-D warnings` |
| Rust formatting | PASS |
| `git diff --check` | PASS |
| Unsigned App + DMG build | PASS |
| `hdiutil verify` | PASS; DMG checksum valid |
| Bundle contract | PASS: `app.paperweave.desktop`, version `0.1.0`, macOS 11.0+ |
| Unsigned boundary | PASS: no Team ID, no usable DMG signature, Gatekeeper rejected both artifacts as expected |

The first sandboxed DMG assembly attempt could not use the host disk-image
service. The identical build command was rerun on the macOS host and completed
successfully; this was an environment boundary, not a retry that changed the
source or build inputs.

## Artifact identity

| Artifact | SHA-256 |
| --- | --- |
| `PaperWeave.app/Contents/MacOS/paperweave` | `96bb30b84cdc013335799e05345eae907d10f59ffb8b923359d4d4e1b0047adc` |
| `PaperWeave_0.1.0_aarch64.dmg` | `458708e9528abdcca79a3bbc2be04edd6ef23d137f77a02fb6959400624e7930` |

The App hash intentionally identifies the main executable. The DMG hash
identifies the complete distributable disk image.

## Installed RC proof

The App produced by the clean clone was installed at
`/Applications/PaperWeave.app` without deleting or replacing the local
PaperWeave workspace database.

- The installed executable SHA-256 matched the clean-build executable.
- `diff -qr` found no difference between the clean-build and installed App
  bundles.
- The installed App launched successfully as PaperWeave 0.1.0 RC.
- The persisted library remained present: 15 papers, 19 Evidence Anchors,
  5 pending Drafts, and 14 Verified Claims.
- The Reader entry point opened successfully and showed its empty-selection
  state, ready for a paper to be chosen from the library.

The full nine-paper compatibility, memory, evidence workflow, and simulated
three-persona acceptance record is maintained in
[`PDF_RELEASE_GATE.md`](PDF_RELEASE_GATE.md). The simulated personas are
automated product validation, not human interviews.

## Release boundary

This RC is suitable only for local internal dogfood on a machine whose user has
explicitly chosen to run the unsigned build. Public distribution remains
blocked until Developer ID signing, notarization, and Gatekeeper acceptance are
completed and independently verified.
