// Capability code imports both contracts directly:
//  - billingEnv, this app's own local contract, resolved through this
//    example's own "@/*" tsconfig path alias (ADR 0023, same mechanism as
//    @examples/tsconfig-aliases itself uses internally)
//  - paymentsEnv, installed as an ordinary package dependency (real module
//    resolution via node_modules) -- discovered during generate:env across
//    that real package boundary via the `packages` allowlist (ADR 0014)
// Both specifiers go through the same resolveImportSpecifier() chokepoint,
// resolved by two independent, composing mechanisms -- see README.md.
import { billingEnv } from "@/features/billing/env.schema.js";
import { paymentsEnv } from "@examples/tsconfig-aliases";

console.log(`Billing webhook secret: ${billingEnv.BILLING_WEBHOOK_SECRET}`);
console.log(`Stripe key (from @examples/tsconfig-aliases): ${paymentsEnv.STRIPE_KEY}`);
