/** One item's (a CM activity, an Annex A control category) evidence status. No claim without a traceable evidence source; every "no-evidence" item says why. */
export interface ItemEvidence {
  readonly id: string
  readonly name: string
  readonly status: "evidence-found" | "no-evidence"
  readonly summary: string
}
