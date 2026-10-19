// Lightweight, dependency-free bundle size budget check (Node builtins only --
// this is dev/CI tooling, not something that ships or runs at runtime).
//
// Guards the package's core promise: the runtime, helpers, and evidence
// entry points stay tiny. Build tooling (`dist/build.js`, `dist/cli/index.js`) is Node-only
// and dev-time-only by design, so it isn't budgeted here -- it just needs to
// stay isolated from the runtime/helpers bundles, which the tree-shaking and
// browser-platform-bundle tests already cover.

// Read by `internal-package-contract tool size`: one budget per entry point, in gzip bytes.
export default [
  { label: "runtime", file: "dist/index.js", maxGzipBytes: 3 * 1024 },
  // Raised from 3KB to 4KB when minification became forbidden (internal-package-contract's
  // NoMinify check): the budget was calibrated on minified output, and the same code unminified
  // gzips to about 3.3KB. A one-time recalibration to the new baseline, not unexamined growth.
  { label: "helpers", file: "dist/helpers.js", maxGzipBytes: 4 * 1024 },
  { label: "evidence", file: "dist/evidence.js", maxGzipBytes: 3 * 1024 },
  { label: "build", file: "dist/build.js", maxGzipBytes: 999 * 1024 },
  { label: "cli", file: "dist/cli/index.js", maxGzipBytes: 999 * 1024 },
]
