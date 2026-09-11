// SHA-256 over a generated fixture tree -- proves determinism empirically
// (two runs against the same generatorVersion produce an identical hash)
// rather than merely asserting it. node:crypto only, no new dependency.

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

async function collectFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await collectFiles(full)));
    else files.push(full);
  }
  return files;
}

/** Hashes every file's `relativePath\0content` pair, in sorted order, into one running SHA-256. */
export async function hashFixtureTree(rootDir) {
  const files = (await collectFiles(rootDir)).sort();
  const hash = createHash("sha256");
  for (const file of files) {
    const relativePath = path.relative(rootDir, file).split(path.sep).join("/");
    const content = await fs.readFile(file, "utf8");
    hash.update(relativePath);
    hash.update("\0");
    hash.update(content);
  }
  return `sha256:${hash.digest("hex")}`;
}
