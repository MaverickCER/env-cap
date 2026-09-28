---
"@maverickcer/env-cap": minor
---

Removes the `examples/nextjs-app` ISO 10007/ISO-IEC 27001 open-standard
alignment report generator (`scripts/open-config-alignment/`, the
`docs:alignment` script, and the two generated `docs/ISO-*.md` reports).
The generation logic behind these ISO-branded reports was never verified
against the real, licensed ISO standard text, creating real copyright/
mislabeling exposure -- this is a pure deletion, not a design change, and
no replacement generator is added in its place.
