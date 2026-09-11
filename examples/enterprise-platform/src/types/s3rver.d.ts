// s3rver ships no type declarations of its own, and no @types/s3rver package
// exists -- this is only used by src/main-headless.ts's smoke test, never
// application code, so a minimal ambient shape (just enough to construct and
// run/close an instance) is sufficient rather than a full type surface.
declare module "s3rver" {
  interface S3rverOptions {
    port?: number;
    address?: string;
    silent?: boolean;
    directory?: string;
  }

  export default class S3rver {
    constructor(options: S3rverOptions);
    run(): Promise<{ address: string; port: number }>;
    close(): Promise<void>;
  }
}
