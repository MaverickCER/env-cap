// Build-time script. Run via `npm run project:ownership`. Never imported by
// application code.
//
// Doesn't self-compare against generateUsageReport()'s own result -- same
// class of divergence documented for inventory.mjs/config-reference.mjs:
// Contract Model orders contracts canonically (buildContractModel()'s own
// deterministic-JSON ordering), not necessarily the scan-discovery order
// computeUsage() itself preserves. Regression protection comes from the
// standard expected/ golden-file mechanism instead (see examples/README.md).
import { generateEvidenceModel } from "@maverickcer/env-cap/build";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ownershipProjection } from "../projections/ownership.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const evidence = await generateEvidenceModel({
  root,
  include: ["src/env.ts"],
  manifestLocation: "src/generated/env.manifest.ts",
});

const { ownership } = ownershipProjection(evidence);
const outputPath = path.join(root, "projected-ownership.json");
await fs.writeFile(outputPath, `${JSON.stringify(ownership, null, 2)}\n`, "utf8");
console.log(`Wrote projected ownership: ${outputPath}`);
