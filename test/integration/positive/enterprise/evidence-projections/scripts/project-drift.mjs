// Build-time script. Run via `npm run project:drift` (after `generate:env`
// has produced the committed artifacts this compares against -- see
// package.json). Never imported by application code.
import { checkEnvArtifacts, generateEvidenceModel } from "env-cap/build";
import { nodeBuildFileSystem } from "env-cap/node";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDriftProjection } from "../projections/drift.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const [checkResult, evidence] = await Promise.all([
  checkEnvArtifacts({ fs: nodeBuildFileSystem,
    root,
    include: ["src/env.ts"],
    manifest: { location: "src/generated/env.manifest.ts" },
    docs: { location: "docs/ENVIRONMENT.md", envExample: { location: ".env.example" } },
  }),
  generateEvidenceModel({ fs: nodeBuildFileSystem,
    root,
    include: ["src/env.ts"],
    previousSnapshotLocation: "docs/env.evidence.json",
  }),
]);

// ArtifactCheckFinding.path is documented as absolute ("Absolute path the
// artifact would be written to") -- unlike EvidenceModel's own portable,
// root-relative convention. Since this is closed-over context supplied by
// the *script* (not derived from `evidence`), relativizing happens here,
// where `root` is actually available -- the projection itself never sees
// an absolute path to normalize in the first place.
const relativeFindings = checkResult.findings.map((finding) => ({
  ...finding,
  path: path.relative(root, finding.path).split(path.sep).join("/"),
}));
const driftProjection = createDriftProjection(relativeFindings);
const { drift } = driftProjection(evidence);
const outputPath = path.join(root, "projected-drift.json");
await fs.writeFile(outputPath, `${JSON.stringify(drift, null, 2)}\n`, "utf8");
console.log(`Wrote projected drift: ${outputPath}`);
console.log(drift.hasDrift ? "Drift detected." : "No drift -- every checked artifact is up to date.");
