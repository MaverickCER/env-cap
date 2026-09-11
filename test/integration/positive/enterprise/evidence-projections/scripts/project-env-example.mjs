// Build-time script. Run via `npm run project:env-example` (which runs
// `generate:env` first, to produce the baseline .env.example this compares
// against). Never imported by application code.
import { generateEvidenceModel } from "env-cap/build";
import { nodeBuildFileSystem } from "env-cap/node";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { envExampleProjection } from "../projections/env-example.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const evidence = await generateEvidenceModel({ fs: nodeBuildFileSystem,
  root,
  include: ["src/env.ts"],
  previousSnapshotLocation: "docs/env.evidence.json",
});

const { envExample } = envExampleProjection(evidence);
// Deliberately not named .env.* -- the root .gitignore's `.env.*` pattern
// (with a narrow `!.env.example` exception) exists to keep real secrets out
// of every example, and this is a committed demonstration artifact, not a
// secret-shaped file.
const outputPath = path.join(root, "projected-env-example.txt");
await fs.writeFile(outputPath, envExample, "utf8");
console.log(`Wrote projected example: ${outputPath}`);

const directlyGenerated = await fs.readFile(path.join(root, ".env.example"), "utf8");
if (directlyGenerated !== envExample) {
  console.error(
    "Projected .env.example differs from generateEnvArtifacts()'s directly-generated one!",
  );
  process.exitCode = 1;
} else {
  console.log("Projected .env.example is byte-identical to the directly-generated one.");
}
