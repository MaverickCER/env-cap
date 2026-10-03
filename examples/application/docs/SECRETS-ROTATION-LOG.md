# Secrets Rotation Log

Internal rotation-compliance artifact for NIST SP 800-53 Rev. 5 **IA-5** (Authenticator Management), control statement (f): "Change or refresh authenticators [organization-defined time period by authenticator type] or when [organization-defined events] occur." Generated from `env-cap`'s own evidence artifact -- see `scripts/rotation-log/README.md` for how.

> **Not NIST certification or ATO evidence.** This is an internal engineering artifact for tracking secrets-rotation hygiene, not a compliance attestation, an authorization package exhibit, or a substitute for your organization's own IA-5 assessment procedures.

Generated at: 2026-10-03T04:30:19.989Z

| Variable | Authenticator type | Rotation period | Last rotated | Status | Time-based trigger | Event-based triggers declared |
| --- | --- | --- | --- | --- | --- | --- |
| `STRIPE_KEY` | api-key | 90 days | 2026-03-01 | **Expired** | Fired | suspected compromise, payments-team member offboarded |
| `DATABASE_URL` | database-credential | 180 days | 2025-01-01 | **Overdue** | Fired | credential leak detected |

## Entries

### `STRIPE_KEY` (app)

- File: `src/env.ts`
- Status: **Expired**
- Expires at: 2026-09-01
- Refresh instructions: Rotate in the Stripe dashboard (Developers -> API keys), then redeploy. Rotate every 90 days.

### `DATABASE_URL` (app)

- File: `src/env.ts`
- Status: **Overdue**
