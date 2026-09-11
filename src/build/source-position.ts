import type ts from "typescript"

/**
 * A precise pointer into a source file -- the shared shape every exact-position fact in the
 * build pipeline (declaration sites, usage sites, dynamic-access sites) uses, so a consumer never
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
 * `node`'s starting line/column within `sourceFile`, both 1-indexed -- TypeScript's own
 * `getLineAndCharacterOfPosition()` returns 0-indexed values for both. Callers combine this with
 * the file path they already have in scope to build a full {@link SourcePosition}; this returns
 * only the two numbers so it's usable identically whether the caller's `file` is already
 * root-relative or still absolute.
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
 * (a {@link runtime.VariableDocs.dynamicAccess} entry) into a
 * {@link SourcePosition}. Splits on the *last* two colons so a path
 * containing colons of its own (rare, but not impossible) still parses --
 * only the trailing `:<line>:<column>` is treated as position syntax.
 * Returns `undefined` for anything that isn't exactly that shape (missing
 * segments, a non-positive-integer line/column, an empty path) -- callers
 * treat that as a malformed citation, never a thrown error. See ADR 0037.
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
 * One developer-declared {@link runtime.VariableDocs.dynamicAccess} citation's
 * current acknowledgment state -- a claim, never an observation. Kept fully
 * separate from `VariableAccessStatus` (which stays exactly 3-valued and
 * purely AST-derived) so a developer's assertion can never make env-cap
 * claim it observed something it didn't. See
 * `evidence-snapshot.ts`'s `computeDynamicAccessAcknowledgments()` (where
 * this is computed) and ADR 0037.
 */
export interface DynamicAccessAssertion extends SourcePosition {
  /**
   * `"fresh"` -- the cited file currently exists and either matches the
   * committed baseline hash or has no baseline yet (a brand-new citation,
   * nothing to contradict it yet). `"stale"` -- the cited file exists but its
   * content has changed since the committed baseline. `"missing"` -- the
   * cited file no longer exists at all. Re-derived from scratch every run;
   * never cached across runs.
   */
  readonly acknowledgment: "fresh" | "stale" | "missing"
  /**
   * SHA-256 hex digest of the cited file's content *as observed this run* --
   * `undefined` iff `acknowledgment === "missing"` (nothing to hash). This is
   * the one field that makes freshness checking possible without a
   * snapshot-only shadow type: the live `EvidenceModel.dependency` a caller
   * gets back and the persisted evidence snapshot a later run reads back as
   * its baseline are the exact same shape -- this run's `contentHash` becomes
   * next run's comparison target directly. See `evidence-snapshot.ts` and
   * ADR 0037.
   */
  readonly contentHash: string | undefined
}
