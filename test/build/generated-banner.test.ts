import { describe, expect, it } from "vitest"
import {
  evidenceDisclaimer,
  evidenceProjectionNote,
  generatedBanner,
  isGeneratedFile,
} from "../../src/build/generated-banner.js"

describe("generatedBanner", () => {
  it("renders the exact ts-comment form by default", () => {
    expect(generatedBanner()).toBe(
      "// GENERATED FILE -- do not edit by hand. Run `npx env-cap` to regenerate.",
    )
  })

  it("renders the exact ts-comment form when explicitly requested", () => {
    expect(generatedBanner("ts")).toBe(
      "// GENERATED FILE -- do not edit by hand. Run `npx env-cap` to regenerate.",
    )
  })

  it("renders the exact markdown-comment form", () => {
    expect(generatedBanner("markdown")).toBe(
      "<!-- GENERATED FILE -- do not edit by hand. Run `npx env-cap` to regenerate. -->",
    )
  })
})

describe("isGeneratedFile", () => {
  it("recognizes both banner formats on the first line", () => {
    expect(isGeneratedFile(generatedBanner("ts") + "\nrest of file")).toBe(true)
    expect(isGeneratedFile(generatedBanner("markdown") + "\nrest of file")).toBe(true)
  })

  it("still recognizes the banner pushed off line one by a shebang/pragma/license header", () => {
    const content = `#!/usr/bin/env node\n"use strict"\n// Copyright\n${generatedBanner("ts")}\nreal content`
    expect(isGeneratedFile(content)).toBe(true)
  })

  it("ignores blank lines when counting how far down to look", () => {
    const content = `\n\n\n${generatedBanner("ts")}`
    expect(isGeneratedFile(content)).toBe(true)
  })

  it("does not count a whitespace-only line as one of the first 20 non-empty lines", () => {
    // 20 whitespace-only lines followed by the real banner: whitespace-only
    // lines must NOT count toward the 20-line budget, or the banner (at
    // real position 21) would fall outside it and go unrecognized.
    const whitespacePadding = Array.from({ length: 20 }, () => "   ").join("\n")
    const content = `${whitespacePadding}\n${generatedBanner("ts")}`
    expect(isGeneratedFile(content)).toBe(true)
  })

  it("does not recognize a banner past the first 20 non-empty lines", () => {
    const padding = Array.from({ length: 20 }, (_, i) => `line ${i}`).join("\n")
    const content = `${padding}\n${generatedBanner("ts")}`
    expect(isGeneratedFile(content)).toBe(false)
  })

  it("returns false for hand-written content with no marker at all", () => {
    expect(isGeneratedFile("export const x = 1\n")).toBe(false)
  })

  it("returns false for empty content", () => {
    expect(isGeneratedFile("")).toBe(false)
  })
})

describe("evidenceDisclaimer", () => {
  it("returns the exact disclaimer text", () => {
    expect(evidenceDisclaimer()).toBe(
      "Machine-generated engineering artifact assembled from statically-provable code facts and author-declared documentation. It can support a security, privacy, or compliance review. It does not itself establish compliance with any standard.",
    )
  })
})

describe("evidenceProjectionNote", () => {
  it("returns just the concept sentence when no evidencePath is given", () => {
    expect(evidenceProjectionNote()).toBe(
      "Projected from env-cap's Evidence Model (ADR 0031/0038), the same source every other generated artifact draws from.",
    )
  })

  it("appends the concrete path when evidencePath is given", () => {
    expect(evidenceProjectionNote("docs/env.evidence.json")).toBe(
      "Projected from env-cap's Evidence Model (ADR 0031/0038), the same source every other generated artifact draws from. This run also wrote it to `docs/env.evidence.json`.",
    )
  })
})
