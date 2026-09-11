// Build-time script. Run via `npm run project:dependency-graph`. Never
// imported by application code.
import { generateEvidenceModel } from "env-cap/build";
import { nodeBuildFileSystem } from "env-cap/node";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dependencyGraphProjection } from "../projections/dependency-graph.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const evidence = await generateEvidenceModel({ fs: nodeBuildFileSystem,
  root,
  include: ["src/env.ts"],
  previousSnapshotLocation: "docs/env.evidence.json",
});

const { dot, mermaid, json } = dependencyGraphProjection(evidence);

await fs.writeFile(path.join(root, "projected-dependency-graph.dot"), `${dot}\n`, "utf8");
await fs.writeFile(path.join(root, "projected-dependency-graph.mmd"), `${mermaid}\n`, "utf8");
await fs.writeFile(
  path.join(root, "projected-dependency-graph.json"),
  `${JSON.stringify(json, null, 2)}\n`,
  "utf8",
);
console.log(`Wrote projected dependency graph (DOT, Mermaid, JSON) to ${root}`);
