---
"@maverickcer/env-cap": patch
---

CI now tests the ESLint plugin across its whole `eslint` peer range. A new `eslint-compat` job installs the
packed tarball beside the lowest and newest release of each ESLint major in the range. It runs both rules
under flat config, under eslintrc where that ESLint still ships it, and through the ESLint CLI. Every
version passed, so the range is unchanged. The guide, the dependency table and the plugin's TSDoc now name
this job instead of saying only ESLint 10 is tested.
