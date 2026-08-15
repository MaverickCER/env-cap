---
"@maverickcer/env-cap": minor
---

Extracts `renderDocs()`'s security-review counters (total/active variables, expired/expiring-soon counts, unowned/duplicate-name counts, undocumented counts) into a new exported `computeSecurityReviewCounters()`/`SecurityReviewCounters` from `@maverickcer/env-cap/build`, instead of only ever becoming rendered Markdown text. The rendered "Security review" section is unchanged, byte-for-byte. Also dedupes the days-remaining arithmetic that was previously implemented three times (`computeExpiringEntries`, the lifecycle report, and the security review) into one shared internal helper. Part of the Finding Model groundwork described in [ADR 0024](specs/decisions/0024-fact-model-architecture.md).
