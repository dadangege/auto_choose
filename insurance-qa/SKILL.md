---
name: insurance-qa
description: Use for insurance policy Q&A, claim eligibility, reimbursement, drug coverage, hospital or pharmacy scope, deductible, payout ratio, exclusions, required claim materials, and multi-part insurance questions. Handles 2025 Hu Hui Bao ordinary, care, and new-citizen versions by selecting policy context, splitting multiple user intents, applying claim and drug judgment rules, and rendering Markdown plus JSON cards.
metadata:
  short-description: Orchestrate Hu Hui Bao insurance Q&A
---

# Insurance QA

Use this skill as the top-level orchestrator for insurance questions. Do not treat the smaller rule files as functions that call each other automatically. The model or application layer must choose the sequence below.

## Required Flow

1. Run policy selection first.
   - Read `references/policy-select.md`.
   - If the product version is unclear and the question depends on version differences, stop and ask the user to choose a version.
   - Never default generic "2025版沪惠保" or "沪惠保" to the ordinary version.
2. Split the user request into claim intents.
   - One user message may contain multiple intents, such as a hospitalization reimbursement question plus a drug reimbursement question.
   - Keep shared context, such as product version and existing disease status, available to every intent.
3. Judge each intent independently.
   - Read `references/claim-judge.md`.
   - Use the raw product documents in `RAW_File/` when a drug directory, indication, exclusion, or exact policy wording must be verified.
4. Render the final answer.
   - Read `references/answer-render.md`.
   - Start with a direct 1-3 sentence answer.
   - If there are multiple intents, render each intent as its own adjacent prose-plus-JSON block. Do not merge all prose into one global answer followed by all JSON cards.

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

- `hospital_self_pay`: hospitalization self-pay expenses, insurance settlement, deductible, payout ratio, or estimated payment.
- `domestic_drug`: domestic high-cost drug coverage, drug directory, indication, prescription, pharmacy, or medical insurance reimbursement.
- `overseas_drug`: Boao/Hainan overseas special drug coverage.
- `car_t`: CAR-T treatment drug coverage.
- `proton_heavy_ion`: proton or heavy-ion treatment.
- `materials`: claim material requirements.
- `coverage_explanation`: benefit explanation, insured amount, hospital scope, waiting period, exclusions, or general coverage.

## Multi-Intent Rule

When one message contains more than one intent:

1. Do not collapse them into one conclusion.
2. Run the same confirmed policy version through all intents unless the user explicitly assigns different products.
3. If one intent can be answered and another lacks information, answer the first and mark the second as "待确认".
4. Do not let missing information for one intent block all other independent intents.
5. Output in this repeated pattern: short prose for intent A, fenced JSON for intent A, short prose for intent B, fenced JSON for intent B.
6. Use concise labels in the prose, such as "住院自费部分：" and "奥希替尼部分：". These labels may be plain text, not Markdown headings.
7. Do not output a single bundled JSON object for multiple intents unless the user or frontend explicitly asks for a bundle.

## Validation Checklist

Before finalizing:

- Product version is either confirmed or the answer asks the user to select it.
- Generic "沪惠保" is never treated as ordinary version by default.
- Care version hospitalization mentions the mutual-aid subsidy requirement, not Shanghai medical insurance settlement.
- New-citizen version hospitalization without local medical insurance settlement uses 20% for non-pre-existing and 10% for pre-existing.
- Drug answers check directory, indication, prescription doctor, purchase channel, charitable assistance, medical-insurance reimbursement, and resistance where relevant.
- Final answer avoids guaranteed language such as "一定能赔" or "肯定赔".
