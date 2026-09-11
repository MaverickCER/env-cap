import { createEnv, documentEnv } from "env-cap";
import { processors, validators } from "env-cap/helpers";

// The contrast baseline for this directory's other fixtures -- a normal,
// valid, fully-documented contract with nothing unusual about it.
const schema = {
  EDGE_CASE_VALID_VARIABLE: {
    processor: processors.toString(),
    validator: validators.required(),
  },
};

export const contract = createEnv(schema, { name: "edge-cases-valid", source: import.meta.url });

documentEnv(schema, {
  owner: "platform-team",
  variables: {
    EDGE_CASE_VALID_VARIABLE: { description: "A normal, valid variable." },
  },
});
