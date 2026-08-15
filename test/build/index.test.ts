import { describe, expect, it } from "vitest"
import * as buildEntryPoint from "../../src/build/index.js"

// Nothing else imports `src/build/index.ts` directly -- every other test
// imports the individual submodules it needs -- so without this file the
// barrel's re-export statements never actually execute and it shows as 0%
// covered despite every symbol it forwards being otherwise fully tested.
// This test exists to exercise the barrel itself and pin its public surface
// (see the file's own module-doc comment for what's deliberately excluded).
describe("env-cap/build entry point", () => {
  it("re-exports the four orchestrator generators", () => {
    expect(buildEntryPoint.generateDocumentation).toBeTypeOf("function")
    expect(buildEntryPoint.generateEnvArtifacts).toBeTypeOf("function")
    expect(buildEntryPoint.generateEnvManifest).toBeTypeOf("function")
    expect(buildEntryPoint.generateUsageReport).toBeTypeOf("function")
  })

  it("re-exports checkEnvArtifacts and the error classes", () => {
    expect(buildEntryPoint.checkEnvArtifacts).toBeTypeOf("function")
    expect(buildEntryPoint.EnvDocumentationGenerationError).toBeTypeOf("function")
    expect(buildEntryPoint.EnvManifestGenerationError).toBeTypeOf("function")
    expect(buildEntryPoint.EnvProjectGenerationError).toBeTypeOf("function")
    expect(buildEntryPoint.EnvUsageAnalysisError).toBeTypeOf("function")
  })

  it("re-exports the lower-level building blocks for custom tooling", () => {
    expect(buildEntryPoint.buildChangeModel).toBeTypeOf("function")
    expect(buildEntryPoint.CHANGE_MODEL_SCHEMA_VERSION).toBeTypeOf("number")
    expect(buildEntryPoint.detectCompatibilityIssues).toBeTypeOf("function")
    expect(buildEntryPoint.buildContractModel).toBeTypeOf("function")
    expect(buildEntryPoint.CONTRACT_MODEL_SCHEMA_VERSION).toBeTypeOf("number")
    expect(buildEntryPoint.deepFreeze).toBeTypeOf("function")
    expect(buildEntryPoint.buildDependencyModel).toBeTypeOf("function")
    expect(buildEntryPoint.DEPENDENCY_MODEL_SCHEMA_VERSION).toBeTypeOf("number")
    expect(buildEntryPoint.discoverSchemaFiles).toBeTypeOf("function")
    expect(buildEntryPoint.computeExpiringEntries).toBeTypeOf("function")
    expect(buildEntryPoint.computeSecurityReviewCounters).toBeTypeOf("function")
    expect(buildEntryPoint.extractPreviouslyDocumentedKeys).toBeTypeOf("function")
    expect(buildEntryPoint.renderDocs).toBeTypeOf("function")
    expect(buildEntryPoint.computeReconciliation).toBeTypeOf("function")
    expect(buildEntryPoint.extractCommentedVariables).toBeTypeOf("function")
    expect(buildEntryPoint.extractDeclaredVariables).toBeTypeOf("function")
    expect(buildEntryPoint.renderEnvExample).toBeTypeOf("function")
    expect(buildEntryPoint.writeEnvExample).toBeTypeOf("function")
    expect(buildEntryPoint.detectExclusiveGroupIssues).toBeTypeOf("function")
    expect(buildEntryPoint.buildFindingModel).toBeTypeOf("function")
    expect(buildEntryPoint.FINDING_MODEL_SCHEMA_VERSION).toBeTypeOf("number")
    expect(buildEntryPoint.linkFiles).toBeTypeOf("function")
    expect(buildEntryPoint.effectiveOwner).toBeTypeOf("function")
    expect(buildEntryPoint.buildLifecycleModel).toBeTypeOf("function")
    expect(buildEntryPoint.LIFECYCLE_MODEL_SCHEMA_VERSION).toBeTypeOf("number")
    expect(buildEntryPoint.applyLiveExpirationOverrides).toBeTypeOf("function")
    expect(buildEntryPoint.collectVariableNames).toBeTypeOf("function")
    expect(buildEntryPoint.resolveLiveExpirationDates).toBeTypeOf("function")
    expect(buildEntryPoint.renderManifest).toBeTypeOf("function")
    expect(buildEntryPoint.buildOwnershipModel).toBeTypeOf("function")
    expect(buildEntryPoint.OWNERSHIP_MODEL_SCHEMA_VERSION).toBeTypeOf("number")
    expect(buildEntryPoint.extractContractDocs).toBeTypeOf("function")
    expect(buildEntryPoint.extractSchemaVariables).toBeTypeOf("function")
    expect(buildEntryPoint.parseSchemaFile).toBeTypeOf("function")
    expect(buildEntryPoint.resolveRelativeImport).toBeTypeOf("function")
  })
})
