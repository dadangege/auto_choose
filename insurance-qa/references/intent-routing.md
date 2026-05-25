# Intent Routing

Use this file when a user question may contain more than one insurance concern.

## Routing Principle

Split by user decision, not by sentence. One sentence can trigger several intents, and one
intent can require several display cards.

Default pipeline:

1. Identify product version or ask for it.
2. Extract shared slots: amount, drug name, version, medical-insurance settlement,
   pre-existing status, prescription duration, hospital/channel, and claim stage.
3. Split user needs into ordered intents.
4. Attach a card plan to every intent.

## Intent Set

- `policy_selection`: product version is missing or ambiguous.
- `coverage_explanation`: benefit map, insured amount, deductible, ratio, or "保什么".
- `version_comparison`: differences among ordinary, care, and new-citizen versions.
- `hospital_self_pay`: hospitalization self-pay, deductible, ratio, or payment estimate.
- `domestic_drug`: domestic high-cost drug directory, indication, prescription, or channel.
- `drug_prescription_duration`: drug prescription exceeds one month.
- `hospital_scope`: hospital, pharmacy, treatment institution, or purchase channel.
- `enrollment`: eligible population, premium, waiting period, insurance period, or whether user can buy.
- `materials`: claim materials.
- `claim_process`: claim application process, timeline, or next step.
- `exclusion`: exclusions, non-covered expense, resistance, charity assistance, or responsibility limits.

## Multi-Intent Rules

- Preserve user order. If the user asks "保障责任 + 奥希替尼", answer coverage first, then drug.
- Reuse shared context across intents. Do not ask for product version repeatedly.
- If one intent lacks information, still answer the independent intents.
- A missing version blocks version-dependent claim conclusions, but does not block a generic
  product-version selection card.
- A drug directory hit never means "一定能赔". Route it to `domestic_drug` plus missing-info cards.

## Examples

`我买的是新市民版，住院自费3万，没走当地医保，我不是既往症。另外奥希替尼能不能报？`

- policy: confirmed new-citizen
- intents: `hospital_self_pay`, `domestic_drug`
- shared slots: amount=30000, local insurance settled=false, pre-existing=false, drug=甲磺酸奥希替尼片

`我买了沪惠保，保障责任都有什么，奥希替尼能报吗？`

- policy: need_select
- intents: `coverage_explanation`, `domestic_drug`
- card behavior: product selection card first; answer generic coverage only if not version-dependent;
  drug card must be marked as "待确认" because version and conditions are not confirmed.
