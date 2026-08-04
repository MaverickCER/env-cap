import { createEnv } from "@maverickcer/env-cap";

// Deliberately not exported -- exercises the "createEnv() call is not
// exported; it can never be included in a generated manifest, so it's
// skipped entirely" ParseWarning (src/build/parse.ts).
const schema = {
  EDGE_CASE_INVALID_VARIABLE: { processor: (value: unknown) => String(value) },
};

const contract = createEnv(schema, { name: "edge-cases-invalid", source: import.meta.url });
void contract;
