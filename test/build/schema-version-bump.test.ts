import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

// ADR 0013 decision 5: a removed field, a changed field type, or a required
// field turning optional needs a `schemaVersion` bump. An added field does
// not. This test compares each committed schema with the SurfaceContract
// baseline, which holds the schemas of the last release.

const here = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(here, "../..")

type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
type JsonObject = Record<string, Json>
type Definitions = Record<string, JsonObject>

/** A property path's shape, without its descriptions. */
interface PathShape {
  readonly signature: string
  readonly required: boolean
}

const NESTED_KEYS = new Set([
  "properties",
  "required",
  "items",
  "anyOf",
  "oneOf",
  "allOf",
  "additionalProperties",
  "$ref",
])
const PROSE_KEYS = new Set(["description", "markdownDescription", "title", "examples", "default"])

function isObject(value: Json | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function refName(node: JsonObject): string | undefined {
  const ref = node["$ref"]
  return typeof ref === "string" ? ref.replace("#/definitions/", "") : undefined
}

function versionOf(definition: JsonObject | undefined): number | undefined {
  const properties = definition?.["properties"]
  const schemaVersion = isObject(properties) ? properties["schemaVersion"] : undefined
  const value = isObject(schemaVersion) ? schemaVersion["const"] : undefined
  return typeof value === "number" ? value : undefined
}

function ownSignature(node: JsonObject): string {
  const own = Object.fromEntries(
    Object.entries(node).filter(([key]) => !NESTED_KEYS.has(key) && !PROSE_KEYS.has(key)),
  )
  return JSON.stringify(own, Object.keys(own).sort())
}

/** Union members are keyed by shape, not index, so adding one does not shift the others. */
function memberKey(member: Json): string {
  if (!isObject(member)) return JSON.stringify(member)
  return refName(member) ?? ownSignature(member)
}

/**
 * Every property path reachable from a versioned definition. A `$ref` to another
 * versioned definition stops the walk: that model's own `schemaVersion` covers it.
 */
function shapeOf(definitions: Definitions, root: string): Map<string, PathShape> {
  const out = new Map<string, PathShape>()
  const walk = (node: Json, at: string, required: boolean, stack: readonly string[]): void => {
    if (!isObject(node)) {
      out.set(at, { signature: JSON.stringify(node), required })
      return
    }
    const name = refName(node)
    if (name !== undefined) {
      const target = definitions[name]
      if (target === undefined || versionOf(target) !== undefined || stack.includes(name)) {
        out.set(at, { signature: `ref:${name}`, required })
        return
      }
      walk(target, at, required, [...stack, name])
      return
    }
    out.set(at, { signature: ownSignature(node), required })
    const properties = node["properties"]
    const requiredList = Array.isArray(node["required"]) ? node["required"] : []
    if (isObject(properties)) {
      for (const [key, child] of Object.entries(properties)) {
        walk(child, `${at}.${key}`, requiredList.includes(key), stack)
      }
    }
    if (node["items"] !== undefined) walk(node["items"], `${at}[]`, true, stack)
    if (isObject(node["additionalProperties"]))
      walk(node["additionalProperties"], `${at}{}`, true, stack)
    for (const union of ["anyOf", "oneOf", "allOf"]) {
      const members = node[union]
      if (Array.isArray(members)) {
        for (const member of members) walk(member, `${at}|${memberKey(member)}`, true, stack)
      }
    }
  }
  const rootDefinition = definitions[root]
  if (rootDefinition !== undefined) walk(rootDefinition, root, true, [root])
  return out
}

/** The breaking changes between two versions of one schema whose `schemaVersion` did not move. */
function unbumpedBreakingChanges(previous: JsonObject, current: JsonObject): string[] {
  const previousDefinitions = (previous["definitions"] ?? {}) as Definitions
  const currentDefinitions = (current["definitions"] ?? {}) as Definitions
  const problems: string[] = []
  for (const name of Object.keys(previousDefinitions).sort()) {
    const previousVersion = versionOf(previousDefinitions[name])
    if (previousVersion === undefined) continue
    if (versionOf(currentDefinitions[name]) !== previousVersion) continue
    const before = shapeOf(previousDefinitions, name)
    const after = shapeOf(currentDefinitions, name)
    for (const [at, shape] of before) {
      const now = after.get(at)
      if (now === undefined)
        problems.push(`${at} was removed (schemaVersion still ${previousVersion})`)
      else if (now.signature !== shape.signature)
        problems.push(`${at} changed type (schemaVersion still ${previousVersion})`)
      else if (shape.required && !now.required)
        problems.push(`${at} became optional (schemaVersion still ${previousVersion})`)
    }
  }
  return problems
}

function readJson(relative: string): JsonObject {
  return JSON.parse(readFileSync(path.join(projectRoot, relative), "utf8")) as JsonObject
}

describe("published JSON Schemas: a breaking shape change bumps schemaVersion", () => {
  const baseline = readJson(".repo-contract/surface-contract/baseline.json")
  const surface = baseline["surface"] as JsonObject
  const baselineSchemas = surface["schemas"] as Record<string, JsonObject>
  const exportsMap = readJson("package.json")["exports"] as Record<string, string>

  const entries = Object.keys(baselineSchemas).sort()

  it("the baseline holds at least one schema entry", () => {
    expect(entries.length).toBeGreaterThan(0)
  })

  it.each(entries)(
    "%s: no removed, retyped or newly optional field at an unchanged schemaVersion",
    (entry) => {
      const exportTarget =
        exportsMap[entry] ?? exportsMap["./schema/*"]?.replace("*", entry.replace("./schema/", ""))
      expect(exportTarget).toBeDefined()
      const current = readJson(exportTarget!)
      expect(unbumpedBreakingChanges(baselineSchemas[entry]!, current)).toEqual([])
    },
  )
})

describe("unbumpedBreakingChanges", () => {
  const schema = (
    version: number,
    payload: JsonObject,
    required: string[] = ["schemaVersion", "name"],
  ): JsonObject => ({
    definitions: {
      Model: {
        type: "object",
        properties: {
          schemaVersion: { type: "number", const: version },
          name: { type: "string", description: "A name." },
          ...payload,
        },
        required,
      },
      Nested: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    },
  })
  const withNested = { nested: { $ref: "#/definitions/Nested" } }

  it("reports a removed field when schemaVersion stays the same", () => {
    expect(unbumpedBreakingChanges(schema(1, withNested), schema(1, {}))).toEqual([
      "Model.nested was removed (schemaVersion still 1)",
      "Model.nested.id was removed (schemaVersion still 1)",
    ])
  })

  it("reports a changed type and a required field turning optional", () => {
    const retyped = schema(1, { name: { type: "number" } }, ["schemaVersion"])
    expect(unbumpedBreakingChanges(schema(1, {}), retyped)).toEqual([
      "Model.name changed type (schemaVersion still 1)",
    ])
    expect(unbumpedBreakingChanges(schema(1, {}), schema(1, {}, ["schemaVersion"]))).toEqual([
      "Model.name became optional (schemaVersion still 1)",
    ])
  })

  it("follows a $ref into an unversioned definition", () => {
    const previous = schema(1, withNested)
    const current = schema(1, withNested)
    ;(current["definitions"] as Definitions)["Nested"]!["properties"] = {}
    expect(unbumpedBreakingChanges(previous, current)).toEqual([
      "Model.nested.id was removed (schemaVersion still 1)",
    ])
  })

  it("accepts the same change once schemaVersion is bumped", () => {
    expect(unbumpedBreakingChanges(schema(1, withNested), schema(2, {}))).toEqual([])
  })

  it("accepts an added field and a changed description at the same schemaVersion", () => {
    const current = schema(1, { ...withNested, extra: { type: "boolean" } })
    ;((current["definitions"] as Definitions)["Model"]!["properties"] as JsonObject)["name"] = {
      type: "string",
      description: "Reworded.",
    }
    expect(unbumpedBreakingChanges(schema(1, withNested), current)).toEqual([])
  })
})
