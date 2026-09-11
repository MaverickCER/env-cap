import { createEnv, documentEnv } from "env-cap";

/**
 * Plain `fetch`, no SDK -- the point of this capability is demonstrating
 * *multiple interdependent secrets that must be classified and rotated
 * together*, a pattern the single-secret capabilities (auth, email) can't
 * show on their own. The actual GitHub OAuth handshake is not real-tested
 * (no local GitHub emulator exists) -- stated honestly in the README, not
 * hidden. Redirect-URL construction and the login page's conditional
 * rendering (does this deployment even offer GitHub login?) are real-tested.
 */
const oauthGithubSchema = {
  GITHUB_CLIENT_ID: {},
  GITHUB_CLIENT_SECRET: {},
};

export const oauthGithubEnv = createEnv(oauthGithubSchema, {
  name: "oauth-github",
  source: import.meta.url,
});

documentEnv(oauthGithubSchema, {
  category: "auth",
  owner: "security-team",
  purpose: "Let firm staff sign in with their existing GitHub-backed SSO identity, avoiding a second password to manage.",
  legalBasis: "Legitimate interest -- reduces credential-sprawl risk for staff accessing confidential matter data.",
  variables: {
    GITHUB_CLIENT_ID: {
      description: "OAuth app client ID, registered in the firm's GitHub organization settings.",
      sensitivity: "credential",
      required: true,
      retention: "Rotated only if the GitHub OAuth app itself is recreated; not time-boxed.",
      metadata: {
        documentation: "https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app",
      },
    },
    GITHUB_CLIENT_SECRET: {
      description: "OAuth app client secret -- must be rotated together with GITHUB_CLIENT_ID if the app is ever recreated.",
      sensitivity: "secret",
      required: true,
      retention: "Rotate immediately if ever exposed; otherwise on the same cadence as GITHUB_CLIENT_ID.",
      auditRequired: true,
      metadata: {
        documentation: "https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app",
      },
    },
  },
});
