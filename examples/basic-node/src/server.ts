import "./startup.js"; // side-effect import: throws and halts startup if validation fails

// This example uses one centralized contract for the whole app -- see env.ts
// for why -- so every module imports the same `env` export directly, never
// through a hand-rolled global wrapper.
import { env } from "./env.js";

console.log(`Connecting to database on port ${env.PORT}...`);
console.log(`Payment provider: ${env.PAYMENT_PROVIDER}`);
console.log(`Log level: ${env.LOG_LEVEL}`);
