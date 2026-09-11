// Server entry point. Validate once, before any capability code runs -- see
// examples/application/src/startup.ts for the same pattern at its simplest.
// Every capability's env.schema.ts calls createEnv() at import time (the
// contract itself), but reading a value off it throws EnvNotReadyError until
// this runs -- see ADR 0002/ADR 0006.
import { validateEnv } from "env-cap";
import { manifest } from "../generated/env.manifest.js";

export async function startServer(values: NodeJS.ProcessEnv = process.env): Promise<void> {
  await validateEnv({ values, manifest });
}
