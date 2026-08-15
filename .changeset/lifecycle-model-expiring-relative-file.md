---
"@maverickcer/env-cap": patch
---

Fixes `LifecycleModel.expiring[].file` to be root-relative and POSIX-separated, matching `LifecycleModelContract.file` and every other canonical model's file convention -- it previously leaked an absolute, machine-specific filesystem path (`buildLifecycleModel()` called `computeExpiringEntries()` without relativizing its result, unlike the rest of the model). `ExpiringEntry`'s own doc comment (an absolute path) still applies to `computeExpiringEntries()`'s other direct consumers (e.g. `DocumentationFindings.expiringSoon`), which are unaffected.
