---
"@maverickcer/env-cap": patch
---

The usage scan no longer applies the 1,000-file sanity limit meant for schema files. Projects with more than 1,000 TypeScript source files can now generate the usage report and evidence. Schema discovery keeps its limit, and it still runs on the same root first, so a misconfigured `root` is still caught.
