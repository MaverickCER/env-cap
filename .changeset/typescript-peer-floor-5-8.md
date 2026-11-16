---
"@maverickcer/env-cap": minor
---

The optional `typescript` peer range now starts at 5.8: `^5.8.0 || ^6.0.0 || ^7.0.0`. TypeScript 5.0 to 5.7
cannot read the CommonJS declarations (`dist/*.d.cts`) under `moduleResolution: nodenext`. Each one
re-exports an ES module, and those releases reject that with TS1479. A project on 5.0 to 5.7 should upgrade
TypeScript before upgrading env-cap.

The `typescript-compat` CI job now derives its releases from the peer range. It installs the lowest and
newest release of each major: 5.8.2, 5.9.3, 6.0.2, 6.0.3 and 7.0.2 today. Each one type-checks the
declarations from an ES module file and a CommonJS file, and runs the scanner. The `eslint-compat` job also
installs `@typescript-eslint/utils` 8.0.0, the floor of its range, beside ESLint 8.57.0. That pair passed,
so the `@typescript-eslint/utils` range is unchanged.
