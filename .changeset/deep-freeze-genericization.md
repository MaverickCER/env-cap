---
"@maverickcer/env-cap": patch
---

Genericizes `live-expirations.ts`'s private, `DiscoveredContract[]`-hardcoded `deepFreezeContracts()` into a new, exported `deepFreeze<T>(value: T): T` (`@maverickcer/env-cap/build`). No behavior change for `resolveLiveExpirationDates()`, which now calls the generic version internally.
