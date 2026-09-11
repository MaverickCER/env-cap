// TypeDoc plugin: gives the default HTML theme's search input a real
// accessible name.
//
// TypeDoc's own `toolbar` partial (node_modules/typedoc/dist/index.js) renders
// `#tsd-search-input` with `role`/`aria-controls`/`aria-autocomplete`/
// `aria-expanded`/`placeholder` -- but no `aria-label`, `title`, or associated
// `<label>`. A `placeholder` is not a valid accessible name (WCAG 2.1 SC 1.3.1
// / 4.1.2); pa11y's WCAG2AA ruleset flags exactly that (H91/F68) on every
// generated `docs/api/index.html`. There is no TypeDoc option to change that
// built-in partial's markup, and overriding the whole default theme just to
// add one attribute would be a large surface to maintain for a one-line fix.
//
// Hand-editing the generated HTML isn't an option either -- `npm run docs:api`
// regenerates `docs/api/` from scratch every time and would silently overwrite
// it. Instead, this hooks the renderer's own `body.end` extension point (the
// sanctioned way to add markup to every generated page) to append a tiny
// inline script that sets `aria-label` on the input once the page loads.
// pa11y drives a real headless Chromium page via puppeteer, so it evaluates
// the live DOM after this script runs, not the static markup TypeDoc emitted.
//
// Wired in via `typedoc.json`'s `plugin` array, so it runs as part of
// `npm run docs:api` -- the fix stays in place after every future docs build,
// not just this one.

import { JSX } from "typedoc"

const LABEL_SCRIPT = [
  'document.getElementById("tsd-search-input")',
  '?.setAttribute("aria-label", "Search the documentation");',
].join("")

/** @param {import("typedoc").Application} app */
export function load(app) {
  // A plain string child would come back through TypeDoc's JSX renderer
  // HTML-escaped (`"` -> `&quot;`) -- fine for normal text nodes, but inside
  // `<script>` those entities are never decoded by the browser, which breaks
  // the script outright. `JSX.Raw` (the same primitive TypeDoc's own theme
  // uses for its inline theme/search bootstrap scripts) inserts the string
  // verbatim instead.
  app.renderer.hooks.on("body.end", () =>
    JSX.createElement("script", null, JSX.createElement(JSX.Raw, { html: LABEL_SCRIPT })),
  )
}
