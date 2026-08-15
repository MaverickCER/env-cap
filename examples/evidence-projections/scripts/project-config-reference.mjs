// Build-time script. Run via `npm run project:config-reference`. Never
// imported by application code.
//
// Unlike project-env-example.mjs, this doesn't self-compare against
// docs/ENVIRONMENT.md -- Contract Model's canonical alphabetical variable
// ordering means this projection's output isn't byte-identical to
// generateDocumentation()'s direct-call output for this schema (see
// projections/config-reference.mjs's own doc comment). Regression
// protection instead comes from the standard expected/ golden-file
// mechanism every other example uses (see examples/README.md).
import { generateEvidenceModel } from "@maverickcer/env-cap/build";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createConfigReferenceProjection } from "../projections/config-reference.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXPIRING_WITHIN_DAYS = 30;

const evidence = await generateEvidenceModel({
  root,
  include: ["src/env.ts"],
  manifestLocation: "src/generated/env.manifest.ts",
  expiringWithinDays: EXPIRING_WITHIN_DAYS,
});

const configReferenceProjection = createConfigReferenceProjection(EXPIRING_WITHIN_DAYS);
const { configReference } = configReferenceProjection(evidence);
const outputPath = path.join(root, "projected-config-reference.md");
await fs.writeFile(outputPath, configReference, "utf8");
console.log(`Wrote projected reference: ${outputPath}`);
