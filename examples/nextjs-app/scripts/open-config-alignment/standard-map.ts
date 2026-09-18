/**
 * ISO 10007:2017's five configuration management process activities,
 * corroborated across independent public summaries (ANSI's own blog post
 * and multiple industry secondary sources, not the standard's own
 * purchasable text -- see this directory's own README).
 */
export const CM_ACTIVITIES: readonly { readonly id: string; readonly name: string }[] = [
  { id: "planning", name: "Configuration Management Planning" },
  { id: "identification", name: "Configuration Identification" },
  { id: "change-control", name: "Change Control" },
  { id: "status-accounting", name: "Configuration Status Accounting" },
  { id: "audit", name: "Configuration Audit" },
]

/**
 * ISO/IEC 27001:2022 Annex A's four control-theme categories (93 controls
 * total: 37 Organizational, 8 People, 14 Physical, 34 Technological),
 * corroborated across independent public summaries -- see this directory's
 * own README.
 */
export const ANNEX_A_CATEGORIES: readonly { readonly id: string; readonly name: string }[] = [
  { id: "organizational", name: "Organizational controls" },
  { id: "people", name: "People controls" },
  { id: "physical", name: "Physical controls" },
  { id: "technological", name: "Technological controls" },
]
