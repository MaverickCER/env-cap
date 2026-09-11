// Build-time script. Run via `npm run project:inventory`. Never imported by
// application code.
//
// Doesn't self-compare against generateEnvArtifacts()'s docs.catalog --
// two documented, non-bug divergences (see projections/inventory.mjs's own
// doc comment): Contract Model's `.file` is root-relative and
// POSIX-separated (portable, serializable -- ADR 0025), while
// DiscoveredContract's is an absolute filesystem path; and variable
// ordering is Contract Model's canonical alphabetical order, not the
// schema's original declaration order (same divergence as
// config-reference.mjs, see its own doc comment). Regression protection
// instead comes from the standard expected/ golden-file mechanism every
// other example uses (see examples/README.md).
import { generateEvidenceModel } from "env-cap/build";
import { nodeBuildFileSystem } from "env-cap/node";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inventoryProjection } from "../projections/inventory.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const evidence = await generateEvidenceModel({ fs: nodeBuildFileSystem,
  root,
  include: ["src/env.ts"],
  previousSnapshotLocation: "docs/env.evidence.json",
});

const { inventory } = inventoryProjection(evidence);
const outputPath = path.join(root, "projected-inventory.json");
await fs.writeFile(outputPath, `${JSON.stringify(inventory, null, 2)}\n`, "utf8");
console.log(`Wrote projected inventory: ${outputPath}`);
