// Build-time script. Run via `npm run generate:env`. Never imported by application code.
//
// Produces the manifest, .env.example, and docs via the *existing*,
// already-tested generateEnvArtifacts() path -- this is the baseline every
// projection in scripts/project-*.mjs compares its own output against.
import { generateEnvArtifacts } from "env-cap/build";
import { nodeBuildFileSystem } from "env-cap/node";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const result = await generateEnvArtifacts({ fs: nodeBuildFileSystem,
  root,
  include: ["src/env.ts"],
  manifest: { location: "src/generated/env.manifest.ts" },
  docs: {
    location: "docs/ENVIRONMENT.md",
    envExample: { location: ".env.example", onExisting: "overwrite" },
  },
  // The baseline every scripts/project-*.mjs script's own `previousSnapshotLocation`
  // reads back -- see ADR 0038.
  evidence: { location: "docs/env.evidence.json" },
});

console.log(`Wrote manifest: ${result.manifest?.outputPath}`);
console.log(`Wrote docs: ${result.docs?.docsPath}`);
console.log(`Wrote example: ${result.docs?.envExample?.writtenPath}`);
console.log(`Discovered ${result.manifest?.contracts.length ?? 0} contract(s).`);
