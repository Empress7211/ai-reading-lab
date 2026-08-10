# PaperWeave Reader Design QA

## Comparison target

- Source visual truth: `/Users/shihongyu.26/.codex/generated_images/019fd6e5-bbb6-78a2-9cd9-edc5143fbd02/exec-aa038963-a924-4f7b-88f9-b5fed0997f1e.png`
- Implementation screenshot: `/Users/shihongyu.26/.codex/worktrees/17e5/Reading-Paper/prototype/screenshots/reader-redesign-final.png`
- Full-view comparison: `/Users/shihongyu.26/.codex/worktrees/17e5/Reading-Paper/prototype/screenshots/reader-redesign-comparison.png`
- Focused PDF comparison: `/Users/shihongyu.26/.codex/worktrees/17e5/Reading-Paper/prototype/screenshots/reader-redesign-pdf-comparison.png`
- Responsive evidence: `/Users/shihongyu.26/.codex/worktrees/17e5/Reading-Paper/prototype/screenshots/reader-redesign-final-1166x768.png`
- Browser state: local two-page A4 PDF imported, first page visible, `我的笔记` selected, no smoke-test Anchors.

## Viewport and normalization

- Source pixels: 1487 x 1058.
- Implementation CSS viewport: 1440 x 1024 at desktop and 1166 x 768 at the original complaint's window size.
- Implementation screenshot pixels: 1440 x 834 for the in-app browser's visible capture surface; the responsive screenshot is 1166 x 768.
- Full-view normalization: source resized proportionally to 1440 px wide and top-cropped to 1440 x 834 so both sides use the same visible crop.
- Screenshot density: 1 image pixel per CSS pixel horizontally. PDF canvas density is independently rendered at 2 output pixels per CSS pixel (1484 x 2098 backing canvas for a 742 x 1049 CSS page at the desktop viewport).

## Full-view comparison evidence

The implementation preserves the selected option's narrow navigation rail, compact Evidence column, dominant document canvas, quiet notes inspector, warm neutral palette, and simplified top toolbar. The PDF content intentionally differs: the user rejected the source mock's raw Markdown-like document, so the implementation uses a real, conventionally typeset PDF rendered by PDF.js.

At 1166 x 768, the Evidence column starts collapsed at 52 px and expands to 214 px on demand. This gives the PDF a 702 px stage instead of recreating the cramped original screenshot. At 1440 px, the full Evidence column and 340 px research inspector remain visible.

## Focused region comparison evidence

The focused comparison confirms that the real PDF page has a clear title, abstract, section hierarchy, body typography, table, page margins, and paper shadow. The page fits its container without horizontal overflow at 100%: 742 px page width inside an 814 px desktop stage, and 630 px page width inside the 702 px compact stage. The backing canvas remains twice the CSS dimensions for sharp text.

## Required fidelity surfaces

- Fonts and typography: UI uses the existing system/Inter stack at 11-14 px; reading UI uses the existing serif stack with Songti SC added for Chinese. The PDF itself remains the source of truth for document fonts. Hierarchy and wrapping match the quiet editorial target.
- Spacing and layout rhythm: 72 px global rail, 214/52 px collapsible Evidence column, flexible document stage, and 340 px research inspector match the selected composition. Paper margins, panel padding, radii, and shadows are consistent.
- Colors and visual tokens: the implementation stays within PaperWeave's ivory, stone, ink, deep green-blue, and muted ochre tokens. There are no new gradients or purple accents.
- Image quality and asset fidelity: the screen requires no custom raster assets. Existing Lucide icons are reused. Real PDF pages render to a high-density canvas rather than using a screenshot or HTML imitation.
- Copy and content: labels preserve PaperWeave's local-first, Evidence Anchor, Verified, and user-owned notes language. Secondary document actions remain available from the overflow menu.

## Comparison history

### Pass 1 - blocked

- P1: the reader-specific 72 px sidebar grid track did not constrain the sidebar item's intrinsic width, so the 239 px sidebar overlapped the Evidence column.
- P2: secondary document actions still consumed toolbar attention.
- P2: the notes inspector lacked a linked Evidence card and used a longer explanatory heading.

Fixes: set an explicit 72 px sidebar width/max-width, moved replace/Zotero/sync actions into a working overflow menu, made `我的笔记` the default inspector, and added a conditional linked Evidence Anchor card.

### Pass 2 - blocked

- P1: at compact width the collapsed Evidence column still displayed the empty-state paragraph, forcing text into a 52 px strip.
- P2: the fixed 1.28 PDF scale caused horizontal overflow and provided no page/zoom affordance.

Fixes: hide all Evidence content except the expand control while collapsed; compute fit width from the live reader size; add 80%-160% zoom, fit-width reset, current-page tracking, previous/next controls, and a high-density canvas.

### Pass 3 - passed

- Post-fix evidence shows no sidebar overlap, no horizontal PDF overflow, a clean collapsed Evidence rail at 1166 x 768, and a conventionally typeset real PDF replacing the rejected Markdown-like mock.
- No actionable P0, P1, or P2 visual differences remain. The different PDF content is an explicit user-requested correction, not design drift.

## Primary interactions and runtime checks

- Imported a local smoke-test PDF through the real file chooser; the app reported that the file stayed local.
- Verified 100% fit, 120% zoom, fit-width reset, next-page navigation (`2 / 2`), and Evidence column expand/collapse (214 px / 52 px).
- Verified overflow-menu visibility and retained replace PDF, Zotero status, and sync preview actions.
- Browser console errors checked: none.

## Follow-up polish

- P3: a future iteration could add a user preference for remembering the Evidence column's expanded state per window size.

final result: passed
