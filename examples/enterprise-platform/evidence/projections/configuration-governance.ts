import type {
  ContractModelContract,
  ContractModelVariable,
  DependencyModelVariable,
  EvidenceModel,
  SourcePosition,
  VariableAccessStatus,
} from "env-cap/build";
import { defineEvidenceProjection } from "env-cap/evidence";

/**
 * The configuration-governance evidence projection -- built entirely on
 * env-cap's public building blocks (Contract Model + Dependency Model + the
 * shared `SourcePosition` shape), the same way the reference projections in
 * test/integration/positive/enterprise/evidence-projections/ are. Named for
 * what it actually enforces, not the domain it happens to run against:
 * three policy rules -- is every credential documented
 * (`credential-without-documentation`), is every sensitive variable's
 * handling legally justified (`sensitive-without-legal-basis`), is every
 * audit-required variable actually auditable
 * (`audit-required-but-not-found`) -- the kind of "here's what we can prove
 * about how configuration is governed" report useful during litigation,
 * audit prep, or as a CI gate. env-cap core exposes the generic facts
 * (sensitivity, metadata, legalBasis, ...); this file, not env-cap,
 * decides what those facts imply for this organization. See ADR 0024 and
 * ADR 0035.
 *
 * IMPORTANT: illustrative only, not legal advice. The domain (a confidential
 * legal-practice matter tracker) exists to demonstrate env-cap's evidence
 * machinery against genuinely sensitive data, not to certify any real
 * organization's compliance posture.
 */

/** `ContractModelContract`/`ContractModelVariable`'s `owner`/`purpose`/`legalBasis`/`retention`/`dataResidency`/`auditRequired`
 *  fields aren't pre-resolved (Contract Model stores each level's raw value, matching
 *  `DiscoveredContract`/`DiscoveredVariable`'s own un-resolved storage) -- these mirror
 *  `env-cap/build`'s own `effectiveX()` helpers, which target `DiscoveredContract`/
 *  `DiscoveredVariable` specifically (a structurally different, Contract-Model-shaped type
 *  Lifecycle Model's `deprecated`/`deprecatedReason` fields keep the two from lining up exactly),
 *  reimplemented here against Contract Model's own shape directly. */
function effective<K extends keyof ContractModelContract & keyof ContractModelVariable>(
  contract: ContractModelContract,
  variable: ContractModelVariable,
  key: K,
): ContractModelContract[K] {
  return (variable[key] ?? contract[key]) as ContractModelContract[K];
}

const SENSITIVE_CLASSIFICATIONS = new Set(["secret", "credential", "pii"]);
/** The sensitivitys an "API key" style value actually gets -- `pii` is personal data, not a credential, so it's deliberately excluded from `credential-without-documentation` below. */
const CREDENTIAL_CLASSIFICATIONS = new Set(["secret", "credential"]);

function documentationLinkOf(metadata: Readonly<Record<string, unknown>> | undefined): string | undefined {
  const link = metadata?.["documentation"];
  return typeof link === "string" && link.length > 0 ? link : undefined;
}

/** The four-way evidence disclosure (plan Design 7) -- always computed from `status` + `dynamicAccessAssertions` together, never letting a developer's claim overwrite what env-cap actually observed. */
export type EvidenceCategory = "proven" | "asserted" | "uncertain" | "not-found";

export function evidenceCategoryOf(dependencyVariable: DependencyModelVariable | undefined): {
  category: EvidenceCategory;
  status: VariableAccessStatus | undefined;
} {
  const status = dependencyVariable?.status;
  const hasFreshAssertion = (dependencyVariable?.dynamicAccessAssertions ?? []).some(
    (a) => a.acknowledgment === "fresh",
  );
  if (status === "used") return { category: "proven", status };
  if (hasFreshAssertion) return { category: "asserted", status };
  if (status === "indeterminate") return { category: "uncertain", status };
  return { category: "not-found", status };
}

/** `"Per developers, this data point is dynamically accessed at <citations>."` -- only ever rendered alongside the raw `status`, never in place of it. */
export function describeAssertions(dependencyVariable: DependencyModelVariable | undefined): string | undefined {
  const fresh = (dependencyVariable?.dynamicAccessAssertions ?? []).filter(
    (a) => a.acknowledgment === "fresh",
  );
  if (fresh.length === 0) return undefined;
  const sites = fresh.map((a) => `${a.file}:${a.line}:${a.column}`).join(", ");
  return `Per developers, this data point is dynamically accessed at ${sites}.`;
}

export interface SensitiveVariableEvidence {
  readonly contractName: string;
  readonly file: string;
  readonly key: string;
  readonly owner: string | undefined;
  readonly sensitivity: string | undefined;
  readonly purpose: string | undefined;
  readonly legalBasis: string | undefined;
  readonly retention: string | undefined;
  readonly dataResidency: string | readonly string[] | undefined;
  readonly auditRequired: boolean | undefined;
  readonly expiresAt: string | undefined;
  /** Where to find/manage this credential -- e.g. `metadata: { documentation: "https://dashboard.stripe.com/apikeys" }`. Checked by `credential-without-documentation` below. */
  readonly documentationLink: string | undefined;
  /** The contract's `createEnv()` call. Always present. */
  readonly declaration: SourcePosition;
  /** The contract's `documentEnv()` call, if any. */
  readonly documentation: SourcePosition | undefined;
  /** This variable's own schema property -- distinct from both positions above. */
  readonly variableDeclaration: SourcePosition;
  /** Every position this variable was actually member-accessed at. */
  readonly accessPositions: readonly SourcePosition[];
  readonly evidenceCategory: EvidenceCategory;
  readonly developerAssertion: string | undefined;
}

function dependencyVariableFor(
  evidence: EvidenceModel,
  file: string,
  exportName: string,
  key: string,
): DependencyModelVariable | undefined {
  const contract = evidence.dependency.contracts.find(
    (c) => c.file === file && c.exportName === exportName,
  );
  return contract?.variables.find((v) => v.key === key);
}

function sensitiveVariables(evidence: EvidenceModel): readonly SensitiveVariableEvidence[] {
  const rows: SensitiveVariableEvidence[] = [];
  for (const contract of evidence.contract.contracts) {
    for (const variable of contract.variables) {
      const sensitivity = effective(contract, variable, "sensitivity");
      if (!sensitivity || !SENSITIVE_CLASSIFICATIONS.has(sensitivity)) continue;

      const dependencyVariable = dependencyVariableFor(
        evidence,
        contract.file,
        contract.exportName,
        variable.key,
      );
      const { category } = evidenceCategoryOf(dependencyVariable);

      rows.push({
        contractName: contract.contractName,
        file: contract.file,
        key: variable.key,
        owner: effective(contract, variable, "owner"),
        sensitivity,
        purpose: effective(contract, variable, "purpose"),
        legalBasis: effective(contract, variable, "legalBasis"),
        retention: effective(contract, variable, "retention"),
        dataResidency: effective(contract, variable, "dataResidency"),
        auditRequired: effective(contract, variable, "auditRequired"),
        expiresAt: variable.expiresAt ?? contract.expiresAt,
        documentationLink: documentationLinkOf(effective(contract, variable, "metadata")),
        declaration: contract.declaration,
        documentation: contract.documentation,
        variableDeclaration: variable.declaration,
        accessPositions: dependencyVariable?.positions ?? [],
        evidenceCategory: category,
        developerAssertion: describeAssertions(dependencyVariable),
      });
    }
  }
  return rows.sort((a, b) =>
    a.contractName !== b.contractName
      ? a.contractName < b.contractName
        ? -1
        : 1
      : a.key < b.key
        ? -1
        : a.key > b.key
          ? 1
          : 0,
  );
}

/** One policy rule's own outcome -- shaped like `Finding` for familiarity, but not part of env-cap's own `FindingCode` union: these rules are this projection's own, per ADR 0024/ADR 0035's "env-cap exposes facts, the organization decides what they mean" boundary. */
export interface PolicyFinding {
  readonly severity: "error" | "warning";
  readonly code: string;
  readonly message: string;
  readonly contractName: string;
  readonly key: string;
}

/**
 * Computed directly from `sensitiveVariables()`'s already-resolved facts, so
 * it's independently unit-testable against a synthetic fixture (see
 * evidence/configuration-governance.test.ts) without needing a real EvidenceModel.
 */
export function computePolicyFindings(
  rows: readonly SensitiveVariableEvidence[],
): readonly PolicyFinding[] {
  const findings: PolicyFinding[] = [];
  for (const row of rows) {
    if (CREDENTIAL_CLASSIFICATIONS.has(row.sensitivity ?? "") && row.documentationLink === undefined) {
      findings.push({
        severity: "warning",
        code: "credential-without-documentation",
        message: `"${row.key}" (owned by "${row.contractName}", sensitivity "${row.sensitivity}") has no metadata.documentation link -- an on-call engineer or auditor has nowhere to go to find, manage, or verify this credential.`,
        contractName: row.contractName,
        key: row.key,
      });
    }
    if (row.legalBasis === undefined) {
      findings.push({
        severity: "warning",
        code: "sensitive-without-legal-basis",
        message: `"${row.key}" (owned by "${row.contractName}", sensitivity "${row.sensitivity}") has no stated legal basis for collection/use.`,
        contractName: row.contractName,
        key: row.key,
      });
    }
    if (row.auditRequired === true && row.evidenceCategory === "not-found") {
      findings.push({
        severity: "error",
        code: "audit-required-but-not-found",
        message: `"${row.key}" (owned by "${row.contractName}") is marked audit-required, but no consumer was found anywhere in the scanned surfaces -- cannot audit access to a variable that's never read.`,
        contractName: row.contractName,
        key: row.key,
      });
    }
  }
  return findings;
}

export const configurationGovernanceProjection = defineEvidenceProjection({
  generatedAt: (evidence) => evidence.provenance.generatedAt,
  toolVersion: (evidence) => evidence.provenance.toolVersion,
  scannedSurfaces: (evidence) => evidence.dependency.scannedSurfaces,
  sensitiveVariables: (evidence) => sensitiveVariables(evidence),
  policyFindings: (evidence) => computePolicyFindings(sensitiveVariables(evidence)),
});
