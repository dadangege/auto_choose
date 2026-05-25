---
name: insurance-qa
description: Use for insurance policy Q&A, claim eligibility, reimbursement, drug coverage, hospital or pharmacy scope, deductible, payout ratio, exclusions, required claim materials, and multi-part insurance questions. Handles 2025 Hu Hui Bao ordinary, care, and new-citizen versions by selecting policy context, splitting multiple user intents, applying claim and drug judgment rules, and rendering Markdown plus JSON cards.
metadata:
  short-description: Orchestrate Hu Hui Bao insurance Q&A
---

# Insurance QA

Use this skill as the top-level orchestrator for insurance questions. Treat it as a
workflow, not as a loose knowledge base. The model or application layer must choose
the sequence, retrieve only relevant references/wiki domains, and output prose plus
frontend card artifacts.

This skill borrows the source-grounded artifact discipline of a paper reader:
facts are selected first, then organized into answer sections, then rendered as
adjacent JSON cards. Do not let the answer degrade into generic Markdown or one
merged JSON bundle.

## Required Flow

1. Run policy selection first.
   - Read `references/policy-select.md`.
   - If the product version is unclear and the question depends on version differences, stop and ask the user to choose a version.
   - Never default generic "2025版沪惠保" or "沪惠保" to the ordinary version.
2. Split the user request into user intents.
   - Read `references/intent-routing.md` when one message contains multiple concerns.
   - One user message may contain multiple intents, such as a hospitalization reimbursement question plus a drug reimbursement question.
   - Keep shared context, such as product version and existing disease status, available to every intent.
3. Build a card plan for each intent.
   - Read `references/card-taxonomy.md`.
   - Choose one primary card and only the supporting cards needed for clarity.
   - Do not emit every possible card.
4. Ground important facts.
   - Read `references/source-grounding.md` when the answer relies on exact policy facts, drug directory membership, payout ratios, exclusions, or calculations.
   - Use raw product documents when a drug indication, exclusion, or exact wording must be verified.
5. Judge each intent independently.
   - Read `references/claim-judge.md`.
   - Missing information for one intent must not block other independent intents.
6. Render the final answer.
   - Read `references/answer-render.md`.
   - Read `references/answer-composition.md` for report-style or multi-card answers.
   - Start with a direct 1-3 sentence answer.
   - If there are multiple intents, render each intent as its own adjacent prose-plus-JSON block. Do not merge all prose into one global answer followed by all JSON cards.

## When To Open References

| File | Open when |
|---|---|
| `references/policy-select.md` | Product version, eligibility, ordinary/care/new-citizen ambiguity |
| `references/intent-routing.md` | Multi-intent questions, query splitting, shared slot handling |
| `references/card-taxonomy.md` | Deciding which key cards should appear |
| `references/source-grounding.md` | Evidence anchors, raw document verification, traceability |
| `references/claim-judge.md` | Claim, drug, deductible, ratio, material judgment |
| `references/answer-render.md` | JSON card fields and Markdown+JSON output |
| `references/answer-composition.md` | Product reader/report-style answer structure |

## Wiki Domains

For fast product use, keep this `SKILL.md` as the orchestrator and retrieve only the domain files needed from `wiki/`:

- `wiki/coverage.md`: benefit responsibilities, insured amounts, high-level limits.
- `wiki/drug.md`: domestic high-cost drugs, drug directory fragments, indications, prescription limits.
- `wiki/hospital.md`: hospital, pharmacy, treatment institution, and purchase-channel scope.
- `wiki/enrollment.md`: eligible population, version qualification, waiting period, insurance period, premium.
- `wiki/claim.md`: claim judgment, payout ratio, deductible, materials, payment estimates.
- `wiki/policy.md`: product/version selection.
- `wiki/exclusion.md`: common exclusions.
- `wiki/render.md`: JSON card contract for frontend rendering.

The JSON is a frontend display contract. It should not replace the prose answer; each intent should have user-facing prose followed by its card JSON.

## Intent Types

Use these coarse intent names when splitting a message:

- `policy_selection`: product version is missing or ambiguous.
- `hospital_self_pay`: hospitalization self-pay expenses, insurance settlement, deductible, payout ratio, or estimated payment.
- `domestic_drug`: domestic high-cost drug coverage, drug directory, indication, prescription, pharmacy, or medical insurance reimbursement.
- `overseas_drug`: Boao/Hainan overseas special drug coverage.
- `car_t`: CAR-T treatment drug coverage.
- `proton_heavy_ion`: proton or heavy-ion treatment.
- `materials`: claim material requirements.
- `coverage_explanation`: benefit explanation, insured amount, hospital scope, waiting period, exclusions, or general coverage.
- `version_comparison`: differences among ordinary, care, and new-citizen versions.
- `hospital_scope`: hospital, pharmacy, treatment institution, or purchase-channel scope.
- `enrollment`: eligible population, premium, waiting period, insurance period, or whether the user can buy.
- `claim_process`: claim application process, timeline, or next step.
- `exclusion`: exclusions, non-covered expense, resistance, charity assistance, or responsibility limits.

## Multi-Intent Rule

When one message contains more than one intent:

1. Do not collapse them into one conclusion.
2. Run the same confirmed policy version through all intents unless the user explicitly assigns different products.
3. If one intent can be answered and another lacks information, answer the first and mark the second as "待确认".
4. Do not let missing information for one intent block all other independent intents.
5. Output in this repeated pattern: short prose for intent A, fenced JSON for intent A, short prose for intent B, fenced JSON for intent B.
6. Use concise labels in the prose, such as "住院自费部分：" and "奥希替尼部分：". These labels may be plain text, not Markdown headings.
7. Do not output a single bundled JSON object for multiple intents unless the user or frontend explicitly asks for a bundle.

## Card Planning Rule

Each intent should have:

- `primary_card`: the main user-facing artifact.
- `supporting_cards`: only the extra cards needed to explain the result.
- `answer_job`: the prose task for that section.
- `source_anchors`: stable evidence labels when the answer depends on exact rules.

Prefer this minimal card stack:

- Product/version unclear: `policyselectcard`.
- Broad coverage question: `coveragecard`.
- Version difference question: `versioncomparecard` or concise version comparison prose.
- Claim or reimbursement question: `claimcard`.
- Drug question: `drugcheckcard` when supported, otherwise `claimcard` with drug conditions.
- Hospital/channel question: `hospitalcard`.
- Enrollment question: `enrollmentcard`.
- Materials/process question: `materialcard`.
- Exclusion-heavy question: `exclusioncard` or evidence note.

If the frontend does not yet render a planned semantic card type, use the nearest existing
renderable card and preserve the richer plan in local orchestration metadata.

## Validation Checklist

Before finalizing:

- Product version is either confirmed or the answer asks the user to select it.
- Generic "沪惠保" is never treated as ordinary version by default.
- Care version hospitalization mentions the mutual-aid subsidy requirement, not Shanghai medical insurance settlement.
- New-citizen version hospitalization without local medical insurance settlement uses 20% for non-pre-existing and 10% for pre-existing.
- Drug answers check directory, indication, prescription doctor, purchase channel, charitable assistance, medical-insurance reimbursement, and resistance where relevant.
- Final answer avoids guaranteed language such as "一定能赔" or "肯定赔".
