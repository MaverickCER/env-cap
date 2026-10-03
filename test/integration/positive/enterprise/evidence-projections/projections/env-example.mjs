import { defineEvidenceProjection } from "@maverickcer/env-cap/evidence";
import { renderEnvExample } from "@maverickcer/env-cap/build";
import { toDiscoveredContracts } from "./lib/to-discovered-contracts.mjs";

/**
 * The ".env.example Artifact" reference projection (plan Phase 15). A thin
 * wrapper: reshapes Contract Model + Lifecycle Model back into the
 * DiscoveredContract[]-compatible shape `renderEnvExample()` (also
 * `@maverickcer/env-cap/build`, entirely unchanged) already expects, then
 * calls it directly -- no new rendering logic lives here. See
 * `lib/to-discovered-contracts.mjs` (shared with every other projection
 * wrapping a `DiscoveredContract[]`-shaped renderer).
 */
export const envExampleProjection = defineEvidenceProjection({
  envExample: (evidence) => renderEnvExample(toDiscoveredContracts(evidence)),
});
