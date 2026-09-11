// Build-time script. Run via `npm run project:change-impact-blast-radius`.
// Never imported by application code.
import { generateEvidenceModel } from "env-cap/build";
import { nodeBuildFileSystem } from "env-cap/node";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { blastRadiusProjection } from "../projections/change-impact-blast-radius.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const evidence = await generateEvidenceModel({ fs: nodeBuildFileSystem,
  root,
  include: ["src/env.ts"],
  previousSnapshotLocation: "docs/env.evidence.json",
});

const { blastRadius } = blastRadiusProjection(evidence);
const outputPath = path.join(root, "projected-blast-radius.json");
await fs.writeFile(outputPath, `${JSON.stringify(blastRadius, null, 2)}\n`, "utf8");
console.log(`Wrote projected blast radius: ${outputPath}`);
console.log(
  blastRadius.totalDistinctFilesAffected === 0
    ? "No changes since the committed manifest snapshot -- nothing to correlate."
    : `${blastRadius.totalDistinctFilesAffected} distinct file(s) affected by changes since the committed manifest snapshot.`,
);
