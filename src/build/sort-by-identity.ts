/**
 * The canonical ordering every fact model's contract list is sorted by: `file`
 * (root-relative, POSIX) then `exportName`. One definition so `JSON.stringify`
 * output is stable and diffs cleanly across Contract / Ownership / Lifecycle /
 * Dependency Models. Internal -- not re-exported from the public `.` barrel.
 */
export function byContractIdentity(
  a: { readonly file: string; readonly exportName: string },
  b: { readonly file: string; readonly exportName: string },
): number {
  return a.file.localeCompare(b.file) || a.exportName.localeCompare(b.exportName)
}
