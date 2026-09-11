import "./startup.js"; // side-effect import: throws and halts startup if validation fails

import { env } from "./env.js";

console.log(`Connecting to database on port ${env.PORT}...`);
console.log(`Payment provider: ${env.PAYMENT_PROVIDER}`);
console.log(`Log level: ${env.LOG_LEVEL}`);
