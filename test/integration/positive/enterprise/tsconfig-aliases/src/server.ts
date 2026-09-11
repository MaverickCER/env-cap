// Its own process, run via `npm start`. Imports the payments contract
// through the "@/*" alias declared in tsconfig.json, exactly like a real
// application using path aliases would -- this is the same import env-cap's
// static analysis resolves during `generate:env`, see README.md.
import { validateEnv } from "env-cap";
import { manifest } from "./generated/env.manifest.js";
import { paymentsEnv } from "@/features/payments/env.schema.js";

await validateEnv({ manifest, values: process.env });

console.log("Environment validated successfully.");
console.log(`Stripe key: ${paymentsEnv.STRIPE_KEY}`);
