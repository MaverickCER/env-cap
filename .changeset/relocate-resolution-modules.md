---
"@maverickcer/env-cap": patch
---

Relocate the import-resolution modules (`resolve-import.ts`, `resolve-tsconfig-paths.ts`, `resolve-package-schema.ts`, `resolve-within-root.ts`) into a new `src/build/resolution/` subfolder, consolidating the `resolveImportSpecifier()` chokepoint (relative → alias → package resolution, ADR 0023/ADR 0014) into one cohesive location. Internal reorganization only -- `@maverickcer/env-cap/build`'s public export names, types, and behavior are unchanged; verified byte-identical before/after. Prompted by `@maverickcer/data-cap` needing the same resolver design; see that package's `src/build/resolution/` for the ported copy.
