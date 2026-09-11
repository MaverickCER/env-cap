// Application entry point. Validate once, before any capability code runs.
import { validateEnv } from "env-cap";
import { manifest } from "./generated/env.manifest.js";

await validateEnv({
  values: process.env,
  manifest,
});

console.log("Environment validated successfully.");
