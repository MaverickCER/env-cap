---
"@maverickcer/env-cap": minor
---

Promotes every remaining Experimental-tier surface to Stable (ADR 0045):
the `packages`/`tsconfig` generator options, `env-cap/build`'s lower-level
discovery/linking primitives, `generateEvidenceModel`/`getEvidenceModel`/
`computeSourceFingerprint`/`renderUsageReport`, the `init` CLI subcommand,
`env-cap/evidence`, and the persisted evidence artifact format. No behavior
change -- this is a compatibility commitment change only. The Experimental
tier remains defined in `VERSIONING.md` for future genuinely-new surfaces;
nothing currently ships under it.

**Named caveat** (see ADR 0045): `env-cap/evidence`'s `EvidenceProjectionResult.sources`
had a specific, previously-documented open design question about its shape
(flat field-path strings vs. structured `EvidenceReference`s) that is not
yet resolved. It is promoted along with everything else for one consistent
fleet-wide policy, but a future shape change there is now a real Stable-tier
breaking change, not a minor-may-break Experimental adjustment.
