import { deepEqual } from "./deep-equal.js"
import { mustGet } from "./map-utils.js"
import type { DiscoveredContract, DiscoveredVariable } from "./link.js"

/**
 * Every documentation field of a variable that a second declaration of it can supply. `metadata` is merged key by
 * key rather than as one value, so it is handled on its own below. `evidence` is not one of them: its citations
 * point at the declaring contract's own code and are re-verified there every run (ADR 0037), so they stay with the
 * contract that wrote them and are never copied to, or compared with, another declaration.
 */
export const VALUE_FIELDS = [
  "description",
  "owner",
  "sensitivity",
  "expiresAt",
  "refreshInstructions",
  "authenticatorType",
  "rotationPeriod",
  "lastRotatedAt",
  "rotationTriggerEvents",
  "setupInstructions",
  "required",
  "deprecated",
  "deprecatedReason",
  "removeBy",
  "renamedFrom",
  "purpose",
  "legalBasis",
  "retention",
  "dataResidency",
  "auditRequired",
] as const satisfies readonly (keyof DiscoveredVariable)[]

/** One declaration of a variable, with the contract that holds it. */
interface Declaration {
  readonly contract: DiscoveredContract
  readonly variable: DiscoveredVariable
}

/**
 * Fills what one declaration of a variable leaves unset from the other declarations of the same variable.
 *
 * @remarks
 * A variable can be declared in more than one contract: a package that ships its own contract (see
 * {@link ../README} "Reusable packages") and the application that consumes it both name the same environment
 * variable, because the process has one flat namespace. Writing the explanation twice is how the two drift, so the
 * declaration that carries it can be the one place it is written, and the other adds only what is its own (the
 * application's own `expiresAt`, say).
 *
 * Every field a declaration leaves unset is taken from another declaration that sets it, as long as one of the two
 * is a package's contract; when several do, the one from a package's contract wins over the application's own, the
 * first package's over a later one's, and the application's own fill a gap only when all of them that set it agree. Two of the application's own contracts never fill each
 * other: they are siblings, often alternatives, and each documents the variable for itself. A field a declaration sets itself is never replaced, so two declarations that set the same field
 * differently still differ afterwards, and the compatibility check can say so. `metadata` is merged key by key under
 * the same rule. Pure: the contracts passed in are not changed.
 */
export function mergeSharedDocumentation(
  contracts: readonly DiscoveredContract[],
): readonly DiscoveredContract[] {
  const declarationsByKey = new Map<string, Declaration[]>()
  for (const contract of contracts) {
    for (const variable of contract.variables) {
      const declarations = declarationsByKey.get(variable.key)
      if (declarations === undefined) declarationsByKey.set(variable.key, [{ contract, variable }])
      else declarations.push({ contract, variable })
    }
  }

  return contracts.map((contract) => ({
    ...contract,
    variables: contract.variables.map((variable) => {
      // A package's contract comes before the application's own; each keeps the order it was found in.
      const fromPackages: Declaration[] = []
      const fromApplication: Declaration[] = []
      for (const declaration of mustGet(declarationsByKey, variable.key)) {
        if (declaration.variable === variable) continue
        const fromPackage = declaration.contract.packageOrigin !== undefined
        // Two of the application's own contracts are siblings, often alternatives (a database it can run on
        // either of), each documenting the variable for itself: one is never the other's explanation.
        if (!fromPackage && contract.packageOrigin === undefined) continue
        ;(fromPackage ? fromPackages : fromApplication).push(declaration)
      }
      return fromPackages.length + fromApplication.length === 0
        ? variable
        : filled(variable, fromPackages, fromApplication)
    }),
  }))
}

/**
 * The value to fill a gap with: the first package declaration's that sets it, otherwise the application
 * declarations' -- but only when every one of them that sets it agrees. The application's own contracts are often
 * alternatives (a database it can run on either of); when they disagree, a package's declaration takes neither.
 */
function donated(
  read: (variable: DiscoveredVariable) => unknown,
  fromPackages: readonly Declaration[],
  fromApplication: readonly Declaration[],
): unknown {
  const fromPackage = fromPackages.find(({ variable }) => read(variable) !== undefined)
  if (fromPackage !== undefined) return read(fromPackage.variable)
  const values = fromApplication
    .map(({ variable }) => read(variable))
    .filter((v) => v !== undefined)
  return values.every((value) => deepEqual(value, values[0])) ? values[0] : undefined
}

/** `variable` with each field and metadata key it leaves unset filled as {@link donated} says. */
function filled(
  variable: DiscoveredVariable,
  fromPackages: readonly Declaration[],
  fromApplication: readonly Declaration[],
): DiscoveredVariable {
  const donors = [...fromPackages, ...fromApplication]
  const merged: Record<string, unknown> = { ...variable }
  for (const field of VALUE_FIELDS) {
    if (variable[field] !== undefined) continue
    // The field is unset here, so writing what `donated` returns, even `undefined`, changes nothing else.
    merged[field] = donated((other) => other[field], fromPackages, fromApplication)
  }
  const metadata: Record<string, unknown> = {}
  for (const key of new Set(
    donors.flatMap(({ variable: other }) => Object.keys(other.metadata ?? {})),
  )) {
    const value = donated((other) => other.metadata?.[key], fromPackages, fromApplication)
    if (value !== undefined) metadata[key] = value
  }
  Object.assign(metadata, variable.metadata)
  const result: DiscoveredVariable = {
    ...(merged as unknown as DiscoveredVariable),
    metadata: Object.keys(metadata).length === 0 ? variable.metadata : metadata,
    documented: variable.documented || donors.some(({ variable: other }) => other.documented),
  }
  // What the merge changed is what the declaration was given: it never replaces what a declaration set itself.
  DONATED.set(
    result,
    new Set([
      ...VALUE_FIELDS.filter((field) => result[field] !== variable[field]),
      ...Object.keys(metadata)
        .filter((key) => metadata[key] !== variable.metadata?.[key])
        .map((key) => `metadata.${key}`),
    ]),
  )
  return result
}

/** What each merged declaration was given by another, keyed by the object {@link mergeSharedDocumentation} returns. */
const DONATED = new WeakMap<DiscoveredVariable, ReadonlySet<string>>()

/**
 * The fields (and `metadata.<key>`s) {@link mergeSharedDocumentation} filled into `variable` from another declaration
 * of it. The compatibility check skips them: a value a declaration was given is not one it wrote, so it cannot
 * disagree with anyone.
 * @param variable - a variable as the merge returned it; any other has been given nothing.
 * @returns the given field names.
 */
export function donatedTo(variable: DiscoveredVariable): ReadonlySet<string> {
  return DONATED.get(variable) ?? new Set()
}
