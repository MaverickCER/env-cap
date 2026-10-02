---
"@maverickcer/env-cap": patch
---

Remove npm and Socket-score caches from the CI workflows (CodeQL `actions/cache-poisoning`: a workflow that runs pull-request code could poison a cache the release build later restores), git-ignore the local code-scanning exception registry, and re-pin internal-package-contract to its 0.7.0 release.
