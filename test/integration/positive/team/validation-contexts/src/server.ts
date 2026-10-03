// Server entry point -- its own process, run via `npm run example:server`.
// Validates the *same* manifest client.ts validates, but with a different
// activeContexts -- see README.md for why that has to be two separate
// process invocations, not two validateEnv() calls in one script.
import { EnvNotReadyError, validateEnv } from "@maverickcer/env-cap";
import { manifest } from "./generated/env.manifest.js";
import { appEnv } from "../features/app/env.schema.js";

await validateEnv({
  manifest,
  values: process.env,
  activeContexts: ["server"],
});

console.log("Validated with activeContexts: [\"server\"]");
console.log(`LOG_LEVEL (no context, always participates): ${appEnv.LOG_LEVEL}`);
console.log(`DATABASE_URL (context: "server", matches): ${appEnv.DATABASE_URL}`);

try {
  console.log(appEnv.PUBLIC_API_URL);
} catch (error) {
  const message = error instanceof EnvNotReadyError ? error.message : String(error);
  console.log(`PUBLIC_API_URL (context: "client", did not match) -- reading it throws:\n  ${message}`);
}
