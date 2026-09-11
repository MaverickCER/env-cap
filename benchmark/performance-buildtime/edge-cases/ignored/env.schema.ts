import { createEnv } from "env-cap";

// This whole directory is excluded via the benchmark's `exclude` glob
// (`**/ignored/**`) -- discovery should never even read this file's
// contents, let alone parse it.
const schema = {
  EDGE_CASE_IGNORED_VARIABLE: { processor: (value: unknown) => String(value) },
};

export const contract = createEnv(schema, { name: "edge-cases-ignored", source: import.meta.url });
