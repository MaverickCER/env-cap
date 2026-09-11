// Build-time script. Run via `npm run project:findings`. Never imported by
// application code.
import { generateEvidenceModel } from "env-cap/build";
import { nodeBuildFileSystem } from "env-cap/node";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findingsProjection } from "../projections/findings.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const evidence = await generateEvidenceModel({ fs: nodeBuildFileSystem,
  root,
  include: ["src/env.ts"],
  previousSnapshotLocation: "docs/env.evidence.json",
});

const { findings } = findingsProjection(evidence);
const outputPath = path.join(root, "projected-findings.json");
await fs.writeFile(outputPath, `${JSON.stringify(findings, null, 2)}\n`, "utf8");
console.log(`Wrote projected findings: ${outputPath}`);
