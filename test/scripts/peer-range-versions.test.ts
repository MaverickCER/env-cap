import { describe, expect, it } from "vitest"
import {
  eslintCompatPairs,
  nodeTypesFor,
  peerRangeBoundaries,
  sortReleases,
} from "../../scripts/peer-range-versions.mjs"

describe("peerRangeBoundaries", () => {
  it("tests the floor and the newest release of every major the range admits", () => {
    expect(peerRangeBoundaries("^8.57.0 || ^9.0.0 || ^10.0.0")).toEqual([
      "8.57.0",
      "8",
      "9.0.0",
      "9",
      "10.0.0",
      "10",
    ])
  })

  it("follows a narrowed range", () => {
    expect(peerRangeBoundaries("^9.15.0")).toEqual(["9.15.0", "9"])
  })

  it.each(["", ">=8.57.0", "~9.0.0", "9.x", "*", "^9", "^9.0.0 - ^10.0.0", "^9.0.0 ||"])(
    "rejects %j, a range it cannot turn into boundary versions",
    (range) => {
      expect(() => peerRangeBoundaries(range)).toThrow(/scripts\/peer-range-versions\.mjs/)
    },
  )
})

describe("eslintCompatPairs", () => {
  it("pairs every ESLint boundary with the newest utils, then the utils floor with the ESLint floor", () => {
    expect(eslintCompatPairs("^8.57.0 || ^9.0.0", "^8.0.0")).toEqual([
      { eslint: "8.57.0", utils: "8" },
      { eslint: "8", utils: "8" },
      { eslint: "9.0.0", utils: "8" },
      { eslint: "9", utils: "8" },
      { eslint: "8.57.0", utils: "8.0.0" },
    ])
  })

  it("pairs the newest utils from the highest major, and every utils floor with the ESLint floor", () => {
    expect(eslintCompatPairs("^9.0.0", "^8.4.0 || ^9.1.0")).toEqual([
      { eslint: "9.0.0", utils: "9" },
      { eslint: "9", utils: "9" },
      { eslint: "9.0.0", utils: "8.4.0" },
      { eslint: "9.0.0", utils: "9.1.0" },
    ])
  })

  it("rejects a utils range it cannot turn into boundary versions", () => {
    expect(() => eslintCompatPairs("^9.0.0", ">=8.0.0")).toThrow(/peer-range-versions\.mjs/)
  })
})

describe("sortReleases", () => {
  it("orders releases by number, not by publish order or text", () => {
    expect(sortReleases(["5.9.3", "5.8.3", "5.10.0", "5.8.2"])).toEqual([
      "5.8.2",
      "5.8.3",
      "5.9.3",
      "5.10.0",
    ])
    expect(sortReleases(["10.0.0", "9.1.0", "9.0.10", "9.0.9"])).toEqual([
      "9.0.9",
      "9.0.10",
      "9.1.0",
      "10.0.0",
    ])
  })

  it("accepts the bare string `npm view --json` prints for a single match", () => {
    expect(sortReleases("7.0.2")).toEqual(["7.0.2"])
  })

  it.each([[[]], [["5.8.2", "5.9.0-beta"]], [["5.8"]], [[" 5.8.2"]], [5]])(
    "rejects %j, which is not a list of X.Y.Z releases",
    (value) => {
      expect(() => sortReleases(value as never)).toThrow(/X\.Y\.Z/)
    },
  )
})

describe("nodeTypesFor", () => {
  it("pairs a floor release with the types of the Node.js floor", () => {
    expect(nodeTypesFor("5.8.0", ">=22.0.0")).toBe("22")
    expect(nodeTypesFor("6.0.0", ">=24.1.0")).toBe("24")
  })

  it("gives the newest release of a major the newest types", () => {
    expect(nodeTypesFor("5", ">=22.0.0")).toBe("latest")
    expect(nodeTypesFor("7", ">=22.0.0")).toBe("latest")
  })

  it.each(["^22.0.0", ">=22", "22.0.0", " >=22.0.0"])(
    "rejects the engines range %j, which has no single floor",
    (range) => {
      expect(() => nodeTypesFor("5.8.0", range)).toThrow(/>=X\.Y\.Z/)
    },
  )
})
