import { generateEvidenceModel, getEvidenceModel } from "env-cap/build";
import { nodeBuildFileSystem } from "env-cap/node";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  computePolicyFindings,
  configurationGovernanceProjection,
  evidenceCategoryOf,
  type SensitiveVariableEvidence,
} from "./projections/configuration-governance.js";

/**
 * The evidence-contract test: pure build-time analysis of this package's own
 * real `src/capabilities/*\/env.schema.ts` files. No Mongo, no TanStack Start
 * dev server, no browser -- proves the configuration-governance report is correct
 * independently of whether the application itself works (see
 * src/main-headless.ts's separate smoke test for that). Non-negotiable per
 * this flagship's own design review.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("configurationGovernanceProjection (evidence-contract test, no Mongo/server/browser)", () => {
  it("produces a sensitive-variable row for every secret/credential/pii-classified variable, across all six capabilities", async () => {
    const { evidence } = await getEvidenceModel({
      fs: nodeBuildFileSystem,
      root,
      location: "docs/env.evidence.json",
      previousSnapshotLocation: "docs/env.evidence.json",
    });
    const { sensitiveVariables } = configurationGovernanceProjection(evidence);

    const byKey = new Map(sensitiveVariables.map((row) => [row.key, row]));
    // One representative sensitive variable per capability -- proves the
    // projection reaches every capability, not just the first one discovered.
    expect(byKey.has("MONGODB_URI")).toBe(true);
    expect(byKey.has("SESSION_SECRET")).toBe(true);
    expect(byKey.has("GITHUB_CLIENT_SECRET")).toBe(true);
    expect(byKey.has("RESEND_API_KEY")).toBe(true);
    expect(byKey.has("S3_SECRET_ACCESS_KEY")).toBe(true);
    // AUDIT_LOG_RETENTION_DAYS and EMAIL_FROM_ADDRESS are "config", never
    // sensitive-classified -- confirms the filter isn't just "everything".
    expect(byKey.has("AUDIT_LOG_RETENTION_DAYS")).toBe(false);
    expect(byKey.has("EMAIL_FROM_ADDRESS")).toBe(false);
  });

  it("resolves owner/purpose/legalBasis via variable-overrides-contract fallback, matching effectiveX() semantics", async () => {
    const { evidence } = await getEvidenceModel({
      fs: nodeBuildFileSystem,
      root,
      location: "docs/env.evidence.json",
      previousSnapshotLocation: "docs/env.evidence.json",
    });
    const { sensitiveVariables } = configurationGovernanceProjection(evidence);
    const stripeKey = sensitiveVariables.find((row) => row.key === "S3_ACCESS_KEY_ID");

    expect(stripeKey?.owner).toBe("compliance-team");
    // S3_ACCESS_KEY_ID sets no variable-level purpose/legalBasis -- both fall
    // back to storage's own contract-level defaults.
    expect(stripeKey?.purpose).toBe(
      "Store case-file attachments -- potentially privileged, client-confidential documents.",
    );
    expect(stripeKey?.legalBasis).toContain("Attorney-client privilege");
  });

  it("every row's three declaration positions resolve to a real file, line, and column -- never collapsed into one", async () => {
    const { evidence } = await getEvidenceModel({
      fs: nodeBuildFileSystem,
      root,
      location: "docs/env.evidence.json",
      previousSnapshotLocation: "docs/env.evidence.json",
    });
    const { sensitiveVariables } = configurationGovernanceProjection(evidence);
    expect(sensitiveVariables.length).toBeGreaterThan(0);

    for (const row of sensitiveVariables) {
      for (const position of [row.declaration, row.documentation, row.variableDeclaration]) {
        if (!position) continue;
        expect(position.file.length).toBeGreaterThan(0);
        expect(position.line).toBeGreaterThanOrEqual(1);
        expect(position.column).toBeGreaterThanOrEqual(1);
      }
      // documentation is a genuinely distinct position from declaration --
      // every capability here calls documentEnv() separately from createEnv().
      expect(row.documentation).toBeDefined();
      expect(row.documentation).not.toEqual(row.declaration);
      expect(row.variableDeclaration).not.toEqual(row.declaration);
    }
  });

  it("categorizes a genuinely used secret as proven, citing its real access site", async () => {
    const { evidence } = await getEvidenceModel({
      fs: nodeBuildFileSystem,
      root,
      location: "docs/env.evidence.json",
      previousSnapshotLocation: "docs/env.evidence.json",
    });
    const { sensitiveVariables } = configurationGovernanceProjection(evidence);
    // SESSION_SECRET is read directly in auth.service.ts.
    const sessionSecret = sensitiveVariables.find((row) => row.key === "SESSION_SECRET");

    expect(sessionSecret?.evidenceCategory).toBe("proven");
    expect(sessionSecret?.accessPositions.length).toBeGreaterThan(0);
    expect(sessionSecret?.accessPositions[0]?.file).toContain("auth.service.ts");
  });

  it("names every scanned surface, so the evidence category is never a stronger claim than what was actually searched", async () => {
    const { evidence } = await getEvidenceModel({
      fs: nodeBuildFileSystem,
      root,
      location: "docs/env.evidence.json",
      previousSnapshotLocation: "docs/env.evidence.json",
    });
    const { scannedSurfaces } = configurationGovernanceProjection(evidence);
    expect(scannedSurfaces.length).toBeGreaterThan(0);
    expect(scannedSurfaces.some((s) => s.label === "application")).toBe(true);
  });

  it("this real, deliberately well-documented deployment produces zero policy findings -- a clean audit", async () => {
    const { evidence } = await getEvidenceModel({
      fs: nodeBuildFileSystem,
      root,
      location: "docs/env.evidence.json",
      previousSnapshotLocation: "docs/env.evidence.json",
    });
    const { policyFindings } = configurationGovernanceProjection(evidence);
    expect(policyFindings).toEqual([]);
  });

  it("stamps real provenance (toolVersion, a fresh generatedAt)", async () => {
    const before = Date.now();
    // generateEvidenceModel(), not getEvidenceModel() -- this test is
    // specifically about what a real generation pass stamps, which
    // getEvidenceModel()'s fingerprint cache would defeat on any run where
    // the source hasn't changed since docs/env.evidence.json was last
    // written (it would then return that older, on-disk generatedAt
    // instead of a fresh one).
    const evidence = await generateEvidenceModel({
      fs: nodeBuildFileSystem,
      root,
      previousSnapshotLocation: "docs/env.evidence.json",
    });
    const { generatedAt, toolVersion } = configurationGovernanceProjection(evidence);
    expect(toolVersion.length).toBeGreaterThan(0);
    expect(new Date(generatedAt).getTime()).toBeGreaterThanOrEqual(before);
  });
});

describe("computePolicyFindings (rule-correctness unit tests, synthetic rows -- no EvidenceModel needed)", () => {
  function row(overrides: Partial<SensitiveVariableEvidence>): SensitiveVariableEvidence {
    return {
      contractName: "test",
      file: "test/env.schema.ts",
      key: "TEST_VAR",
      owner: "test-team",
      sensitivity: "secret",
      purpose: "Testing.",
      legalBasis: "Legitimate interest.",
      retention: undefined,
      dataResidency: undefined,
      auditRequired: undefined,
      expiresAt: undefined,
      documentationLink: "https://example.invalid/docs",
      declaration: { file: "test/env.schema.ts", line: 1, column: 1 },
      documentation: { file: "test/env.schema.ts", line: 5, column: 1 },
      variableDeclaration: { file: "test/env.schema.ts", line: 2, column: 3 },
      accessPositions: [],
      evidenceCategory: "proven",
      developerAssertion: undefined,
      ...overrides,
    };
  }

  it("flags a secret-classified variable (an API key) with no metadata.documentation link", () => {
    const findings = computePolicyFindings([
      row({ sensitivity: "secret", documentationLink: undefined, key: "STRIPE_API_KEY" }),
    ]);
    expect(findings).toEqual([
      expect.objectContaining({ code: "credential-without-documentation", key: "STRIPE_API_KEY" }),
    ]);
  });

  it("flags a credential-classified variable with no metadata.documentation link, same as secret", () => {
    const findings = computePolicyFindings([
      row({ sensitivity: "credential", documentationLink: undefined, key: "DB_USER" }),
    ]);
    expect(findings).toEqual([
      expect.objectContaining({ code: "credential-without-documentation", key: "DB_USER" }),
    ]);
  });

  it("does not flag a secret/credential-classified variable that does have a documentation link", () => {
    const findings = computePolicyFindings([
      row({ sensitivity: "secret", documentationLink: "https://dashboard.stripe.com/apikeys" }),
    ]);
    expect(findings.some((f) => f.code === "credential-without-documentation")).toBe(false);
  });

  it("does not flag a pii-classified variable for missing documentation -- pii is personal data, not a credential", () => {
    const findings = computePolicyFindings([
      row({ sensitivity: "pii", documentationLink: undefined, key: "CLIENT_SSN" }),
    ]);
    expect(findings.some((f) => f.code === "credential-without-documentation")).toBe(false);
  });

  it("flags any sensitive-classified variable with no stated legal basis", () => {
    const findings = computePolicyFindings([row({ legalBasis: undefined, key: "NO_BASIS" })]);
    expect(findings).toEqual([
      expect.objectContaining({ code: "sensitive-without-legal-basis", key: "NO_BASIS" }),
    ]);
  });

  it("flags an audit-required variable env-cap found no consumer for, as an error (not a warning)", () => {
    const findings = computePolicyFindings([
      row({ auditRequired: true, evidenceCategory: "not-found", key: "UNAUDITABLE" }),
    ]);
    expect(findings).toEqual([
      expect.objectContaining({
        code: "audit-required-but-not-found",
        severity: "error",
        key: "UNAUDITABLE",
      }),
    ]);
  });

  it("does not flag an audit-required variable that's proven, asserted, or merely uncertain -- only not-found", () => {
    for (const category of ["proven", "asserted", "uncertain"] as const) {
      const findings = computePolicyFindings([row({ auditRequired: true, evidenceCategory: category })]);
      expect(findings.some((f) => f.code === "audit-required-but-not-found")).toBe(false);
    }
  });

  it("a fully clean row (purpose, legal basis, and proven access) produces no findings at all", () => {
    expect(computePolicyFindings([row({})])).toEqual([]);
  });
});

describe("evidenceCategoryOf (four-way disclosure, unit-tested directly)", () => {
  it("used -> proven, regardless of any assertion", () => {
    expect(evidenceCategoryOf({ key: "K", status: "used", positions: [], dynamicAccessAssertions: [] }).category).toBe(
      "proven",
    );
  });

  it("unconsumed + fresh assertion -> asserted", () => {
    expect(
      evidenceCategoryOf({
        key: "K",
        status: "unconsumed",
        positions: [],
        dynamicAccessAssertions: [
          { file: "scripts/x.sh", line: 1, column: 1, acknowledgment: "fresh", contentHash: "deadbeef" },
        ],
      }).category,
    ).toBe("asserted");
  });

  it("indeterminate + stale assertion -> uncertain, never asserted (a stale claim doesn't count)", () => {
    expect(
      evidenceCategoryOf({
        key: "K",
        status: "indeterminate",
        positions: [],
        dynamicAccessAssertions: [
          { file: "scripts/x.sh", line: 1, column: 1, acknowledgment: "stale", contentHash: "deadbeef" },
        ],
      }).category,
    ).toBe("uncertain");
  });

  it("unconsumed, no assertions at all -> not-found", () => {
    expect(
      evidenceCategoryOf({ key: "K", status: "unconsumed", positions: [], dynamicAccessAssertions: [] })
        .category,
    ).toBe("not-found");
  });

  it("undefined dependency variable (never even discovered) -> not-found, not a crash", () => {
    expect(evidenceCategoryOf(undefined).category).toBe("not-found");
  });
});
