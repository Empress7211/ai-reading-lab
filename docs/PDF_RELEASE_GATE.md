# PDF release gate

This gate is the minimum PDF compatibility and resource check for a PaperWeave
desktop RC. It complements the automated `LocalPdfViewer` tests; it does not
replace a real macOS reading pass.

## Release corpus

Use the public PDFs in
`/private/tmp/pdfs/paperweave-ai-corpus-20260825/`. The current nine-document
gate covers short, medium, and long AI papers:

| PDF | Pages | RC 0.1.0 desktop result (2026-08-26) |
| --- | ---: | --- |
| 01-attention-is-all-you-need.pdf | 15 | PASS: `[1,2]` to `[14,15]` |
| 02-bert.pdf | 16 | PASS: `[1,2]` to `[15,16]` |
| 03-gpt-3.pdf | 75 | PASS: `[1,2]` to `[74,75]` |
| 05-ddpm.pdf | 25 | PASS: `[1,2]` to `[24,25]` |
| 06-clip.pdf | 48 | PASS: `[1,2]` to `[47,48]` |
| 09-flashattention.pdf | 34 | PASS: page 34 canvas rendered; its tail pages expose no selectable text through the macOS accessibility tree |
| 10-segment-anything.pdf | 30 | PASS: `[1,2]` to `[29,30]` |
| 11-llama-2.pdf | 77 | PASS: `[1,2]` to `[76,77]` |
| 12-deepseek-r1.pdf | 86 | PASS: `[1,2]` to `[85,86]`; also passed at 160% zoom |

`[x,y]` records the only pages whose body text layer was present after the
render window settled. All page placeholders remained available for direct
navigation.

The supplemental mixed-geometry fixture is
`/private/tmp/paperweave-qa-corpus/mixed-size-rotation-ai-paper-fixture.pdf`.
It contains Letter, A4, rotated Letter, and A4 pages. Keep its automated
placeholder-geometry test and the four offline renders in the release check;
the fixture is derived from public Attention and BERT pages and is not part of
the nine-document product corpus.

## Desktop procedure

1. Build a release bundle and install that exact `.app` in `/Applications`.
2. Open every corpus entry from the local library and confirm the reported
   page count.
3. At the first page, confirm that only pages 1-2 have live canvas/text-layer
   content while all page placeholders exist.
4. Jump to the last page. Confirm the toolbar reaches `N / N`, the final page
   is visible, and only pages `N-1` and `N` retain live content.
5. For DeepSeek-R1, zoom to 160% and repeat the final-page check.
6. Sample the PaperWeave, WebContent, GPU, and Networking processes. Reject the
   RC if the combined physical-footprint peak reaches 3 GB or if memory keeps
   rising across the 15-, 75-, 77-, and 86-page passes.
7. Run the automated frontend, typecheck, production build, Rust tests,
   clippy, and `git diff --check` before declaring the gate complete.

## Current resource evidence

The 2026-08-26 installed-RC pass observed these RSS totals:

- Attention start: about 167 MB.
- Attention last page: about 286 MB.
- GPT-3 last page: about 270 MB.
- DeepSeek-R1 last page: about 231 MB.
- DeepSeek-R1 last page at 160%: about 260 MB.

`vmmap -summary` reported physical-footprint peaks of 983.0 MB for WebContent,
211.6 MB for the PaperWeave process, and 224.2 MB for the GPU process. Their
conservative sum is about 1.42 GB, below the 3 GB gate. The later long-document
RSS samples decreased rather than rising monotonically.

## Simulated UX acceptance

The 2026-08-26 RC also passed a simulated UX study. This is desktop workflow
validation performed by an automated operator acting as three target personas;
it is not a substitute for interviews or usability sessions with real people.

| Persona | Papers | Completed desktop evidence flow |
| --- | --- | --- |
| Algorithm and systems researcher | Attention, FlashAttention, DeepSeek-R1 | `15→1`, `34→1`, `86→1` |
| Applied NLP researcher | BERT, RAG, Chain-of-Thought | `16→1`, `19→1`, `43→1` |
| Multimodal researcher | CLIP, DDPM, Segment Anything | `48→1`, `25→1`, `30→1` |

Every paper completed `Anchor → manual Draft → human Review → Verified Claim →
six-part Judgment`, followed by a jump from the last page back to the page-1
source evidence. FlashAttention used `Edit & Accept`. DeepSeek-R1 first rejected
an overgeneralized claim that pure reinforcement learning removes the need for
supervised fine-tuning in every task, then accepted a bounded replacement.

After quitting and relaunching `/Applications/PaperWeave.app`, the library still
reported 19 Anchors and 14 Verified Claims. A read-only SQLite audit found 22
Drafts, 17 ReviewActions, 14 Verified Claims, and 11 Judgments in the workspace.
For the nine target papers specifically, each had one locatable page-1 Anchor,
one reviewed Verified Claim, and one complete Judgment; all nine Judgments had
non-empty text in all six sections and referenced at least one Verified Claim.

### Automation boundary and product findings

- macOS accessibility exposed PDF.js text but could not create a local text
  selection in the Tauri WebView. The nine target Anchors were therefore seeded
  from the real paper quotations, page indexes, and normalized return geometry
  after backing up the SQLite database to
  `/private/tmp/paperweave-stage3-backup.SuFv2O/paperweave.sqlite3`. Draft,
  Review, Judgment, last-page navigation, return-to-evidence, quit, and relaunch
  were all exercised through the installed desktop UI.
- Two real `生成 AI Draft` calls using `DeepSeek-V4-Flash` returned HTTP 429
  `Rate limit reached for requests`. The second call was the single planned
  post-study retry; no automatic retry or fallback was used.
- Re-entering six Judgment sections for every paper made the evidence boundary
  clear but was the largest repeated interaction cost in the study.
- Opening a filtered library row has a visible intermediate `正在打开` state.
  Desktop automation must wait for the reader and full-text index states before
  interacting with the research panel.
