# Secrets-rotation log generator

Writes `docs/SECRETS-ROTATION-LOG.md`, a rotation log organized around NIST SP 800-53 Rev. 5 IA-5 (Authenticator Management). It is built from the lifecycle fields each variable declares. The log supports a review.

It does not show that the control is met, because env-cap reads declarations and never checks them against the secret store.

The fields it reads:

| Field                                                                           | Source                                                                                                               |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `expiresAt`, `refreshInstructions`                                              | `documentEnv()`, also used by `docs/ENVIRONMENT.md`                                                                  |
| `authenticatorType`, `rotationPeriod`, `lastRotatedAt`, `rotationTriggerEvents` | `documentEnv()`; see `VariableDocs` in `src/runtime/document.ts` of the main package                                 |
| `rotationStatus`                                                                | Computed by `computeRotationStatus()` in `src/build/lifecycle-model.ts`: a judgement over declared dates and periods |

## Files

- [`types.ts`](types.ts): `RotationLogEntry` and `RotationLogModel`, the log's JSON shape.
- [`build-model.ts`](build-model.ts): a pure function from `EvidenceModel` to `RotationLogModel`. Call `buildRotationLogModel()` to feed your own renderer or dashboard.
- [`render.ts`](render.ts): the default Markdown renderer. NIST publishes no template for this log, so the column layout is this example's choice. The columns follow IA-5's main statement only; the log does not cite IA-5(13).
- [`print-lines.ts`](print-lines.ts): prints the raw model line by line.
- [`run.ts`](run.ts): reads `docs/env.evidence.json` through `getEvidenceModel()`, writes the log, and prints the raw model.

The generator reads the evidence file instead of re-running discovery. The Lifecycle Model already carries every rotation field and the computed status, and `getEvidenceModel()` recomputes only when the fingerprint does not match.

## Running it

| Command                | Exit code | Line of output to look for                          |
| ---------------------- | --------- | --------------------------------------------------- |
| `npm run docs:reports` | `0`       | `[rotation-log] wrote docs/SECRETS-ROTATION-LOG.md` |

`docs:reports` runs `npm run docs` first, so the evidence file is current. CI runs it through `npm start` in the `examples` job but asserts nothing about this script's output.
