<!-- One widget per pull request, please. -->

## What it is

<!-- What does it show, and why does it earn space on someone's wallpaper? -->

## Screenshots

<!-- Every size you offer, on a dark theme and a light one. -->

| | Dark | Light |
|---|---|---|
| `1×1` | | |
| `2×1` | | |

## Does it run or fetch anything?

<!-- Subprocesses, files read, network requests. "No" is a fine answer, and
     the most common one. If yes, say what and how often, here rather than in
     a footnote. -->

No.

## What you tested against

<!-- Missing data, stale data, no network, a value far longer than expected,
     a fresh config, an existing one. -->

## Checklist

- [ ] Colours from `Color.*` only, sizes from `unit`/`width`/`height`
- [ ] Draws no background or border of its own; no `MouseArea`; no animation
- [ ] `type` and `settings` keys are names I am happy to keep forever
- [ ] Logic with a right answer is in `Model.js`, with a test
- [ ] `node --test tests/` passes
- [ ] `omarchy plugin validate .` passes
- [ ] I have read [DESIGN.md](../DESIGN.md)
