import { createEnv } from "env-cap";

// Eight levels deep -- confirms discovery's recursive walk handles unusual
// directory depth without excessive per-level overhead or a stack issue.
const schema = {
  EDGE_CASE_DEEPLY_NESTED_VARIABLE: { processor: (value: unknown) => String(value) },
};

export const contract = createEnv(schema, { name: "edge-cases-deeply-nested", source: import.meta.url });
