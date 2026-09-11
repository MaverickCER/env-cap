// Build-time script. Run via `npm run project:change-impact-audit-trail`.
// Never imported by application code.
import { generateEvidenceModel } from "env-cap/build";
import { nodeBuildFileSystem } from "env-cap/node";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditTrailProjection } from "../projections/change-impact-audit-trail.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const evidence = await generateEvidenceModel({ fs: nodeBuildFileSystem,
  root,
  include: ["src/env.ts"],
  previousSnapshotLocation: "docs/env.evidence.json",
});

const { auditTrail } = auditTrailProjection(evidence);
const outputPath = path.join(root, "projected-audit-trail.json");
await fs.writeFile(outputPath, `${JSON.stringify(auditTrail, null, 2)}\n`, "utf8");
console.log(`Wrote projected audit trail: ${outputPath}`);
console.log(auditTrail.summary);
