// Build-time script. Run via `npm run project:lifecycle`. Never imported by
// application code.
import { generateEvidenceModel } from "env-cap/build";
import { nodeBuildFileSystem } from "env-cap/node";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lifecycleProjection } from "../projections/lifecycle.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const evidence = await generateEvidenceModel({ fs: nodeBuildFileSystem,
  root,
  include: ["src/env.ts"],
  previousSnapshotLocation: "docs/env.evidence.json",
});

const { lifecycle } = lifecycleProjection(evidence);
const outputPath = path.join(root, "projected-lifecycle.json");
await fs.writeFile(outputPath, `${JSON.stringify(lifecycle, null, 2)}\n`, "utf8");
console.log(`Wrote projected lifecycle: ${outputPath}`);
