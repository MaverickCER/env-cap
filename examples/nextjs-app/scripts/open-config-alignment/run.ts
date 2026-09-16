// Regenerates docs/ISO-10007-2017.md and docs/ISO-IEC-27001-2022.md from
// this example's own, freshly-generated docs/env.evidence.json -- see
// gather-evidence.ts and render-markdown.ts for the reasoning. Run via
// `npm run docs:alignment` (see package.json), which chains `npm run docs`
// first so the evidence file this script reads is always current.
import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { gather10007Evidence, gather27001Evidence } from "./gather-evidence.js"
import { render10007Markdown, render27001Markdown } from "./render-markdown.js"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const generatedAt = new Date().toISOString()

const entries10007 = gather10007Evidence(root)
const markdown10007 = render10007Markdown({ entries: entries10007, generatedAt })
const outputPath10007 = path.join(root, "docs/ISO-10007-2017.md")
mkdirSync(path.dirname(outputPath10007), { recursive: true })
writeFileSync(outputPath10007, markdown10007)

const entries27001 = gather27001Evidence(root)
const markdown27001 = render27001Markdown({ entries: entries27001, generatedAt })
const outputPath27001 = path.join(root, "docs/ISO-IEC-27001-2022.md")
writeFileSync(outputPath27001, markdown27001)

const found10007 = entries10007.filter((e) => e.status === "evidence-found").length
const found27001 = entries27001.filter((e) => e.status === "evidence-found").length
console.log(
  `[open-config-alignment] wrote docs/ISO-10007-2017.md (${String(found10007)}/${String(entries10007.length)}) and docs/ISO-IEC-27001-2022.md (${String(found27001)}/${String(entries27001.length)})`,
)
