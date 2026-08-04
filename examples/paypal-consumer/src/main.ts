// Application entry point. Validate once, before any capability code runs.
import { validateEnv } from "@maverickcer/env-cap";
import { manifest } from "./env.manifest.js";

await validateEnv({
  values: process.env,
  manifest,
});

console.log("Environment validated successfully.");

// Side-effect import: runs after validation succeeds, throws and halts
// startup if it failed.
await import("./app.js");
