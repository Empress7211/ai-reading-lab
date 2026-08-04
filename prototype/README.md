# AI Reading Lab — Interactive Product Prototype

This prototype turns the repository's research governance into a clickable reading workspace. It deliberately starts with zero papers read and treats all assisted content as pending until the researcher records an original note and a source locator.

## Information architecture

1. **今日阅读** — daily focus, one-paper WIP, 90-minute protocol, cycle question and weekly commitments.
2. **专注研读** — timer, five reading checkpoints, epistemic labels, evidence locators and locally saved drafts.
3. **证据画布** — candidate connections across training objective, interaction environment and evaluation; promotion requires an original explanation plus locator.
4. **论文库** — search, depth filters, schedule and detail drawer for the ten core papers.
5. **周结** — actual hours, closed-book recall, unresolved questions, human/assistant disagreement and guarded adjustment suggestion.
6. **周期综合** — three-axis analytical skeleton, open research questions and synthesis readiness.

## Visual system

- Paper white and warm neutral surfaces, deep ink navigation, cobalt actions and amber pending states.
- Editorial serif is reserved for paper titles and research questions; sans serif handles dense workspace UI.
- Borders and spatial grouping express hierarchy; cards are reserved for discrete, actionable objects.
- Desktop uses a persistent research rail; mobile uses a compact top bar and five-item bottom navigation.
- Icons come from Lucide. No generated or external product imagery is used.

## Core prototype behavior

- Hash-based navigation makes each workspace directly addressable.
- Reader timer and checkpoint completion are intentionally session-only.
- Evidence connections cannot become verified until the explanation is at least 20 characters and a source locator is present.
- Search and reading-depth filters update the paper library immediately.
- Weekly drafts and synthesis questions are editable during the current prototype session.

## Run

```bash
pnpm install
pnpm dev
```

The prototype is a standalone Vite application and does not alter the repository's generated dashboard or reading-note index.
