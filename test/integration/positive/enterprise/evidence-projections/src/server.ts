// A minimal, real consumer of ./env.ts -- not a runnable app (this example
// has no `start` script; see README.md), just enough real usage for the
// static dependency scanner (generateEvidenceModel() -> Dependency Model)
// to have something to report besides "never consumed anywhere."
import { env } from "./env.js";

console.log(`Connecting to database on port ${env.PORT}...`);
console.log(`Payment provider: ${env.PAYMENT_PROVIDER}`);
