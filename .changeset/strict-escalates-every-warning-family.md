---
"@maverickcer/env-cap": minor
---

**Breaking, pre-1.0 (any Stable API may change in a minor per VERSIONING.md):**
bare `--strict` now escalates every warning family (compatibility, documentation,
ownership) to a hard error, not just manifest compatibility (ADR 0044). This
matches `@maverickcer/data-cap`'s own `--strict`, which already escalates
every pass. `--strict-docs`/`--strict-ownership` are unchanged and still work
independently. A CI script relying on bare `--strict` _not_ escalating
documentation/ownership warnings needs to switch to the scoped flags (or fix
the newly-escalated findings).
