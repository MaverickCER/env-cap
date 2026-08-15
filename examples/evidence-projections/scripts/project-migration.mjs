// Build-time script. Run via `npm run project:migration`. Never imported by
// application code.
import { generateEvidenceModel } from "@maverickcer/env-cap/build";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrationProjection } from "../projections/migration.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const evidence = await generateEvidenceModel({
  root,
  include: ["src/env.ts"],
  manifestLocation: "src/generated/env.manifest.ts",
});

const { migration } = migrationProjection(evidence);
const outputPath = path.join(root, "projected-migration.json");
await fs.writeFile(outputPath, `${JSON.stringify(migration, null, 2)}\n`, "utf8");
console.log(`Wrote projected migration checklist: ${outputPath}`);
console.log(
  migration.renames.length === 0 && migration.removedWithoutRename.length === 0
    ? "No migration steps needed -- nothing renamed or removed since the committed manifest snapshot."
    : `${migration.renames.length} rename(s), ${migration.removedWithoutRename.length} unreplaced removal(s).`,
);
