// Capability code imports its own contract directly -- both the local "app"
// capability and paypal-addon's contract, installed as an ordinary package
// dependency. Note this import goes through @examples/paypal-addon (real
// module resolution via node_modules), while scripts/generate-manifest.mjs
// discovered the same contract by walking paypal-addon's actual source
// location -- discovery and runtime consumption use different mechanisms,
// see the package's README.
import { appEnv } from "./env.schema.js";
import { createCheckout, paypalEnv } from "@examples/paypal-addon";

console.log(`Starting ${appEnv.APP_NAME} on port ${appEnv.PORT}...`);
console.log(`PayPal client: ${paypalEnv.PAYPAL_CLIENT_ID}`);

const checkout = await createCheckout({ amount: 4999, currency: "USD" });
console.log("Created checkout session:", checkout);
