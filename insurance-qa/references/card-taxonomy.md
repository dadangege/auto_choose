# Card Taxonomy

Use this file to choose the frontend cards for each insurance intent.

## Card Planning Model

Each intent should produce:

- one `primary_card`: the main card answering that intent
- zero or more `supporting_cards`: context cards that help the user understand the answer
- one `answer_job`: what the prose section must do
- optional `source_anchors`: stable rule/evidence labels such as `P001`, `D001`, `C001`

Do not output every possible card. Choose the smallest card stack that makes the answer clear.

## Card Types

### Existing Renderable Cards

- `policyselectcard`: use when the version is missing or ambiguous.
- `coveragecard`: benefit map, insured amount, deductible, ratio, hospital/channel summary.
- `claimcard`: eligibility, reimbursement estimate, condition checklist, and missing information.
- `hospitalcard`: hospital, pharmacy, treatment institution, and purchase-channel scope.
- `enrollmentcard`: eligible population, premium, waiting period, and product entry.
- `materialcard`: claim process or required materials.

### Planned Semantic Cards

These may be rendered as generic cards until the frontend supports richer layouts:

- `versioncomparecard`: compare ordinary, care, and new-citizen version gates.
- `drugcheckcard`: drug directory hit, indication, prescription, channel, insurance reimbursement,
  charity assistance, and resistance checks.
- `evidencecard`: source anchors and factual basis behind a conclusion.
- `nextstepcard`: user-facing next information to provide or next action to take.
- `exclusioncard`: exclusions or non-covered conditions.

When a planned semantic card overlaps an existing card, prefer existing renderable cards unless
the answer would become unclear.

## Intent-To-Card Matrix

| Intent | Primary card | Supporting cards |
|---|---|---|
| `policy_selection` | `policyselectcard` | `versioncomparecard` |
| `coverage_explanation` | `coveragecard` | `versioncomparecard`, `hospitalcard` |
| `version_comparison` | `versioncomparecard` | `coveragecard` |
| `hospital_self_pay` | `claimcard` | `evidencecard`, `nextstepcard` |
| `domestic_drug` | `drugcheckcard` or `claimcard` | `hospitalcard`, `evidencecard`, `nextstepcard` |
| `drug_prescription_duration` | `claimcard` | `exclusioncard` |
| `hospital_scope` | `hospitalcard` | `coveragecard` |
| `enrollment` | `enrollmentcard` | `versioncomparecard` |
| `materials` | `materialcard` | `nextstepcard` |
| `claim_process` | `materialcard` | `nextstepcard` |
| `exclusion` | `exclusioncard` | `evidencecard` |

## Card Selection Rules

- If product version is unclear and the question is version-dependent, first card is
  `policyselectcard`.
- If the user asks a broad product question, include `coveragecard`.
- If the user asks "能不能赔", use `claimcard` or `drugcheckcard` as the primary card.
- If the user asks "赔多少", use `claimcard` and include `estimated_payment` when enough slots exist.
- If the answer contains many missing conditions, add `nextstepcard`.
- If the answer depends on a rule that users often misunderstand, add `evidencecard`.
- Do not merge unrelated intents into one card. Adjacent prose and JSON must stay together.
