// Next.js's official startup hook (https://nextjs.org/docs/app/guides/instrumentation).
// register() runs once, before the server starts handling requests, for both
// `next dev` and `next start`. Importing the same "./env.js" next.config.ts
// already imports at build time means this file adds no second copy of the
// validation logic -- only a second trigger point, for the runtime paths
// next.config.ts's build-time evaluation doesn't cover.
export async function register(): Promise<void> {
  if (process.env["NEXT_RUNTIME"] === "nodejs") {
    // Extensionless, unlike this project's plain-Node scripts (env.ts,
    // validate-env.ts) which use the NodeNext "./x.js"-referring-to-"./x.ts"
    // convention: Turbopack's dynamic-import() resolver (confirmed
    // empirically) expects a real ".js" file to exist for that form and
    // fails to fall back to the ".ts" source, unlike its static-import
    // resolution or tsx's loader.
    await import("./env")
  }
}
