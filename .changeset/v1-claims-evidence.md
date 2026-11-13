---
"@maverickcer/env-cap": patch
---

Documentation now describes the TypeScript 6 compiler as the package's one npm dependency, bundled inside the tarball and used only by the build entry, and says that installing your own TypeScript is optional. The rotation-log example quotes NIST SP 800-53 IA-5(f) verbatim and no longer calls itself a compliance artifact, and the enterprise example no longer describes its report as useful in litigation.

What installing the package adds is now generated into ADOPTION.md from `package.json` (`internal-package-contract generate`, reasons in `docs/surface.json`), and the standard-format documents it generates are a generated table in `specs/generated-artifacts.md` that cites the test checking each format. SARIF output is now validated in tests against the official OASIS 2.1.0 schema (a managed copy from internal-package-contract), and a finding with a position points at the cited file, percent-encoded.
