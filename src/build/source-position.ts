import type ts from "typescript"

/**
 * A precise pointer into a source file. Every exact-position fact in the build pipeline
 * (declaration sites, usage sites, dynamic-access sites) shares this shape. So a consumer never
 * has to reconcile three ad hoc `{ file; line; column }` shapes that happen to mean the same
 * thing. See ADR 0036.
 */
export interface SourcePosition {
  /** Root-relative, POSIX-separated. */
  readonly file: string
  /** 1-indexed line number. */
  readonly line: number
  /** 1-indexed column number. */
  readonly column: number
}

/**
 * `node`'s starting line/column within `sourceFile`, both 1-indexed: TypeScript's own
 * `getLineAndCharacterOfPosition()` returns 0-indexed values for both. Callers add the file path
 * they have in scope to build a full {@link SourcePosition}. Returning only the two numbers keeps
 * it usable whether that path is root-relative or absolute.
 */
export function positionOf(
  sourceFile: ts.SourceFile,
  node: ts.Node,
): { line: number; column: number } {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
  return { line: line + 1, column: character + 1 }
}

/**
 * Parses a developer-supplied `"<relative-path>:<line>:<column>"` citation
 * (a {@link runtime.VariableEvidenceDocs.dynamicAccess} entry) into a
 * {@link SourcePosition}. Splits on the *last* two colons, so a path that
 * contains colons still parses. Only the trailing `:<line>:<column>` is
 * position syntax. Returns `undefined` for any other shape: missing segments,
 * a line or column that is not a positive integer, or an empty path. Callers
 * treat that as a malformed citation, not a thrown error. See ADR 0037.
 */
export function parsePositionCitation(citation: string): SourcePosition | undefined {
  const match = /^(.+):(\d+):(\d+)$/.exec(citation)
  if (!match) return undefined
  const [, file, lineText, columnText] = match
  const line = Number(lineText)
  const column = Number(columnText)
  if (!file || line < 1 || column < 1) return undefined
  return { file, line, column }
}

/**
 * One developer-declared {@link runtime.VariableEvidenceDocs.dynamicAccess} citation's
 * current acknowledgment state: a claim, never an observation. It stays
 * separate from `VariableAccessStatus`, which is 3-valued and AST-derived only.
 * So a developer's assertion can never make env-cap claim an observation it
 * did not make. See
 * `evidence-snapshot.ts`'s `computeDynamicAccessAcknowledgments()` (where
 * this is computed) and ADR 0037.
 */
export interface DynamicAccessAssertion extends SourcePosition {
  /**
   * `"fresh"`: the cited file exists and matches the committed baseline
   * hash, or has no baseline yet (a new citation). `"stale"`: the cited file exists but its
   * content has changed since the committed baseline. `"missing"`: the
   * cited file no longer exists at all. Re-derived from scratch every run;
   * never cached across runs.
   */
  readonly acknowledgment: "fresh" | "stale" | "missing"
  /**
   * SHA-256 hex digest of the cited file's content *as observed this run*:
   * `undefined` iff `acknowledgment === "missing"` (nothing to hash). This is
   * the one field that makes freshness checking possible without a
   * snapshot-only shadow type. The live `EvidenceModel.dependency` a caller
   * gets back has the exact same shape as the persisted evidence snapshot a
   * later run reads back as its baseline. So this run's `contentHash` becomes
   * next run's comparison target directly. See `evidence-snapshot.ts` and
   * ADR 0037.
   */
  readonly contentHash: string | undefined
}
