import { resetCache } from "./cache.js"

/**
 * Clears cached validation state. Intended for tests and dev tooling (e.g.
 * `beforeEach(() => resetEnvCache())` in a test suite that re-validates with
 * different fixture values per test) -- production applications validate
 * once at startup and should not normally call this.
 */
export function resetEnvCache(): void {
  resetCache()
}
