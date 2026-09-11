// Build-time script. Run via `npm run project:joined-variables`. Never
// imported by application code.
//
// Same golden-file regression protection as every other projection here
// (see examples/README.md) -- not compared against generateEnvArtifacts()'s
// own output, since nothing on the direct-call path produces this
// cross-model shape today; that's the whole point of this projection.
import { generateEvidenceModel } from "env-cap/build";
import { nodeBuildFileSystem } from "env-cap/node";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { joinedVariablesProjection } from "../projections/joined-variables.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const evidence = await generateEvidenceModel({ fs: nodeBuildFileSystem,
  root,
  include: ["src/env.ts"],
  previousSnapshotLocation: "docs/env.evidence.json",
});

const { rows } = joinedVariablesProjection(evidence);
const outputPath = path.join(root, "projected-joined-variables.json");
await fs.writeFile(outputPath, `${JSON.stringify(rows, null, 2)}\n`, "utf8");
console.log(`Wrote ${rows.length} joined variable row(s): ${outputPath}`);
