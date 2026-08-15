// Build-time script. Run via `npm run project:findings`. Never imported by
// application code.
import { generateEvidenceModel } from "@maverickcer/env-cap/build";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findingsProjection } from "../projections/findings.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const evidence = await generateEvidenceModel({
  root,
  include: ["src/env.ts"],
  manifestLocation: "src/generated/env.manifest.ts",
});

const { findings } = findingsProjection(evidence);
const outputPath = path.join(root, "projected-findings.json");
await fs.writeFile(outputPath, `${JSON.stringify(findings, null, 2)}\n`, "utf8");
console.log(`Wrote projected findings: ${outputPath}`);
