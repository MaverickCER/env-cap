/**
 * The Node file system adapter for the build entry (`@maverickcer/env-cap/node`).
 *
 * `@maverickcer/env-cap/build` never imports `node:fs` (ADR 0040), so every generator takes the file
 * system as a required `fs` option. A Node build script passes `nodeBuildFileSystem`:
 *
 * ```ts
 * import { generateEnvArtifacts } from "@maverickcer/env-cap/build"
 * import { nodeBuildFileSystem } from "@maverickcer/env-cap/node"
 *
 * await generateEnvArtifacts({ fs: nodeBuildFileSystem, root, manifest: { ... } })
 * ```
 *
 * Like `bin` and `./eslint-plugin`, this entry runs only in Node, and it is the one place the build
 * path loads `node:fs/promises`. In another runtime, implement the `BuildFileSystem` type that
 * `./build` exports instead.
 *
 * @packageDocumentation
 */

/** One directory entry from {@link BuildFileSystem.readdir}: the subset of Node's `Dirent` the build code reads. */
declare interface BuildDirent {
    readonly name: string;
    /** Same contract as Node's `Dirent.isDirectory()`. */
    readonly isDirectory: () => boolean;
    /** Same contract as Node's `Dirent.isFile()`. */
    readonly isFile: () => boolean;
}

/**
 * The filesystem a package's `./build` entry is handed by its caller.
 *
 * `./build` is a library surface, so it never imports `node:fs` itself (the `no-node-fs` rule enforces that).
 * Every public options object carries a required `fs` of this type. The CLI builds one over `node:fs/promises`;
 * a test hands in the same adapter or an in-memory fake. Real filesystem work still happens; the capability is
 * handed in rather than acquired.
 *
 * The signatures mirror `node:fs/promises`, so a thin adapter is a drop-in value. The entry and stat types are
 * structural ({@link BuildDirent}, {@link BuildStats}) rather than Node's own, so the boundary does not leak
 * Node's types. Only the operations the build code calls are declared.
 *
 * This file is the canonical source; a package carries a managed copy (`src/_ipc/build-fs.ts`, see `sync`).
 */
declare interface BuildFileSystem {
    /** Read a UTF-8 text file. Rejects if the path doesn't exist or isn't readable. */
    readonly readFile: (path: string, encoding: "utf8") => Promise<string>;
    /** Write a UTF-8 text file, creating or truncating it. The parent directory must already exist. */
    readonly writeFile: (path: string, data: string, encoding: "utf8") => Promise<void>;
    /** Create a directory and every missing parent. A no-op if it already exists. */
    readonly mkdir: (path: string, options: {
        readonly recursive: true;
    }) => Promise<void>;
    /** List a directory's entries with their file-type info. */
    readonly readdir: (path: string, options: {
        readonly withFileTypes: true;
    }) => Promise<readonly BuildDirent[]>;
    /** Stat a path (following symlinks). Rejects if the path doesn't exist. */
    readonly stat: (path: string) => Promise<BuildStats>;
    /** Resolve a path to its canonical, symlink-free absolute form. */
    readonly realpath: (path: string) => Promise<string>;
}

/** A path's stat info from {@link BuildFileSystem.stat}: the subset of Node's `Stats` the build code reads. */
declare interface BuildStats {
    /** Same contract as Node's `Stats.isFile()`. */
    readonly isFile: () => boolean;
    /** Size in bytes: read by the package-schema resolver to enforce a size ceiling. */
    readonly size: number;
}

/**
 * The Node-backed `BuildFileSystem`: the filesystem capability the build-time generators require.
 * @public
 */
export declare const nodeBuildFileSystem: BuildFileSystem;

export { }
