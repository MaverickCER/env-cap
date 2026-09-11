// Application entry point. Validate once, before any capability code runs.
import { validateEnv } from "env-cap";
import { manifest } from "./generated/env.manifest.js";

await validateEnv({
  manifest,
  values: process.env,
});

console.log("Environment validated successfully.");
