import { describe, expect, it } from "vitest"
import { parsePositionCitation } from "../../src/build/source-position.js"

describe("parsePositionCitation", () => {
  it("parses a well-formed <path>:<line>:<column> citation", () => {
    expect(parsePositionCitation("src/env.ts:12:5")).toEqual({
      file: "src/env.ts",
      line: 12,
      column: 5,
    })
  })

  it("parses multi-digit line and column numbers, not just single digits", () => {
    expect(parsePositionCitation("src/env.ts:123:456")).toEqual({
      file: "src/env.ts",
      line: 123,
      column: 456,
    })
  })

  it("splits on the LAST two colons, so a path containing its own colons still parses", () => {
    expect(parsePositionCitation("C:/repo/src/env.ts:12:5")).toEqual({
      file: "C:/repo/src/env.ts",
      line: 12,
      column: 5,
    })
  })

  it("rejects trailing garbage after the column -- the whole string must match, not just a suffix", () => {
    expect(parsePositionCitation("src/env.ts:12:5extra")).toBeUndefined()
    expect(parsePositionCitation("src/env.ts:12:5 ")).toBeUndefined()
    expect(parsePositionCitation("src/env.ts:12:5\n")).toBeUndefined()
  })

  it("rejects a citation preceded by a newline -- `.` doesn't span it, so without the `^` anchor forcing the match to start at index 0, the regex engine would otherwise just retry from the next line and still match", () => {
    expect(parsePositionCitation("\nsrc/env.ts:12:5")).toBeUndefined()
  })

  it("rejects a missing line or column segment", () => {
    expect(parsePositionCitation("src/env.ts:12")).toBeUndefined()
    expect(parsePositionCitation("src/env.ts")).toBeUndefined()
  })

  it("rejects a non-numeric line or column", () => {
    expect(parsePositionCitation("src/env.ts:x:5")).toBeUndefined()
    expect(parsePositionCitation("src/env.ts:12:x")).toBeUndefined()
  })

  it("rejects a zero or negative line/column", () => {
    expect(parsePositionCitation("src/env.ts:0:5")).toBeUndefined()
    expect(parsePositionCitation("src/env.ts:5:0")).toBeUndefined()
  })

  it("rejects an empty path", () => {
    expect(parsePositionCitation(":12:5")).toBeUndefined()
  })

  it("rejects a completely empty string", () => {
    expect(parsePositionCitation("")).toBeUndefined()
  })
})
