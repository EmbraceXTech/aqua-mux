# LP range editor

`/lp/design` is an interactive prototype. Prices and chart history are illustrative. Selecting a range changes the preview only; it does not register a position or submit a transaction.

## UX references

- [Uniswap's new v3 position guide](https://support.uniswap.org/hc/en-us/articles/7423194619661-How-to-add-a-new-liquidity-position-to-Uniswap-v3) separates custom and full ranges, exposes minimum and maximum prices, and explains the out-of-range state. It also documents rounding to pool ticks.
- [1inch Aqua's position guide](https://1inch.com/blog/post/what-positions-can-i-create-on-aqua) describes full range, presets, custom bounds, and the loss of fee earning outside a concentrated range.

The editor uses these range-selection conventions, with draggable horizontal boundaries on a price-history chart. Drag either boundary to resize the range or the highlighted band to translate it without changing its width. Numeric inputs and percentage presets update the same per-pair state. The market price stays fixed when bounds change.

The chart freezes its scale during a drag, clamps bounds to the visible scale, and prevents crossing. Manual input can expand the scale. Fit range reframes the chart. Arrow keys adjust a focused boundary; Shift or Page Up/Down uses a larger step. Home/End moves it to its allowed limit. Escape or pointer cancellation restores the range at the start of a drag. Touch dragging uses pointer capture and does not scroll the page.

Hover details remain available on the chart background and pair summaries. Dragging suppresses the chart popover. Invalid numeric ranges display an error and disable review. Full range preserves the previous custom bounds for that pair.

The prototype uses decimal increments relative to the sample price, not Uniswap pool ticks. Production integration must use the selected strategy's actual price constraints and token decimals rather than assume Uniswap's tick model applies to Aqua.

## Checks

Run from `apps/aqua-mux-app`:

```sh
npx tsx --test components/lp-design/range-model.test.ts
npx eslint components/lp-design
```

With the dev server running:

```sh
LP_DESIGN_URL=http://127.0.0.1:3100/lp/design \
  npx playwright test components/lp-design/range-interaction.spec.ts --workers=1
```

The browser tests use an isolated Chromium context with no wallet connection. They cover resizing, translating, boundary clamping, cancellation, keyboard precision, pair switching, validation, presets, full range, review, and touch dragging.
