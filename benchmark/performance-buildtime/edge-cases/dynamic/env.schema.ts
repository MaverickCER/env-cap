import { createEnv } from "env-cap";

// A function-call computed property name -- unlike a template literal
// interpolating a known local const (which static analysis CAN resolve),
// a function call's return value can't be evaluated without executing it,
// which build-time analysis deliberately never does (ADR 0002).
function computeKey(): string {
  return "EDGE_CASE_DYNAMIC_VARIABLE";
}

const schema = {
  [computeKey()]: { processor: (value: unknown) => String(value) },
};

export const contract = createEnv(schema, { name: "edge-cases-dynamic", source: import.meta.url });
