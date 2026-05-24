# Claim Judgment Rules

Apply these rules after product selection. If the product version is not confirmed, return "待确认" or ask the user to select a version.

## Common Judgment Steps

For every intent:

1. Identify claim type and benefit responsibility.
2. Check whether required product version context exists.
3. Match the benefit responsibility.
4. Check prerequisites, deductible, payout ratio, insured amount, and exclusions.
5. List missing information.
6. Output support status as `支持`, `不支持`, or `待确认`.

## Hospitalization Self-Pay Responsibility

Benefit name: `特定住院自费医疗费用保险金`.

Common checks:

- Disease or accidental injury caused hospitalization.
- Ordinary inpatient department.
- Required hospital scope is met.
- Expenses are reasonable and necessary.
- Expenses are within the defined self-pay expense scope.
- Annual deductible is exceeded.
- Pre-existing condition status is known.
- No exclusion is triggered.

Version-specific rules:

- Ordinary version:
  - Eligible population: Shanghai basic medical insurance participants.
  - Hospital scope: local second-level or above medical-insurance designated hospital ordinary inpatient department.
  - Must be settled by Shanghai basic medical insurance before claim.
  - Non-pre-existing: 70%; pre-existing: 50%; insured amount: 1,000,000.
- Care version:
  - Eligible population: participants in Shanghai citizen community medical mutual-aid plan.
  - Hospital scope: Shanghai second-level or above medical-insurance designated hospital ordinary inpatient department.
  - Must first obtain the Shanghai citizen community medical mutual-aid plan medical expense subsidy.
  - Non-pre-existing: 70%; pre-existing: 50%; insured amount: 1,000,000.
- New-citizen version:
  - Eligible population: workers in some large Shanghai enterprises who participate in local basic medical insurance.
  - Hospital scope: Shanghai second-level or above medical-insurance designated hospital ordinary inpatient department.
  - After local basic medical insurance settlement: non-pre-existing 70%, pre-existing 50%.
  - Without local basic medical insurance settlement: non-pre-existing 20%, pre-existing 10%.
  - Insured amount: 1,000,000.

Deductible:

- Basic annual deductible: 12,000.
- Continuous two-year participation and no claim: 11,000.
- Continuous three-year participation and no claim: 10,000.
- If history is unknown, estimate with 12,000 and disclose that the actual deductible may differ.

Payment estimate:

```text
estimated payment = max(0, eligible expense - deductible) * payout ratio
```

## Domestic High-Cost Drug Responsibility

Benefit name: `国内特定高额药品费用保险金`.

Common payout:

- Non-pre-existing: 70%.
- Pre-existing: 30%.
- Deductible: 0.
- Insured amount: 1,000,000.

Checks:

- Drug is in the domestic high-cost drug directory.
- Disease and indication match the directory.
- Prescription is issued by a designated specialist doctor after registration at a Shanghai second-level or above hospital.
- There is outpatient medical record and prescription.
- Purchase is from Shanghai second-level or above hospital outpatient department or qualified Shanghai pharmacy.
- Charitable assistance rules are followed if applicable.
- If the drug has entered national medical insurance and the drug expense was reimbursed by medical insurance, the product no longer accepts the related claim; if medical-insurance reimbursement was not obtained, continue judging by policy terms.
- Prescription quantity beyond one month is excluded.
- Drug resistance may exclude payment after review.

Known directory evidence in the raw product documents:

- `泰瑞沙` / `甲磺酸奥希替尼片` appears in all three versions' domestic high-cost drug directories.
- The listed disease is `肺癌`.
- The listed indication is for adult locally advanced unresectable stage III NSCLC patients with EGFR exon 19 deletion or exon 21 L858R mutation who have not progressed during or after platinum-based chemoradiotherapy.

Even when a drug is in the directory, do not say it is definitely payable without checking indication, prescription doctor, purchase channel, medical-insurance reimbursement, charity assistance, and resistance.

## Shared Exclusions

Usually not covered:

- Infertility treatment, artificial insemination, pregnancy, delivery, miscarriage, birth control, prenatal or postnatal checks, and related complications.
- Work injury or occupational disease expenses.
- Expenses that should be paid by a third party.
- Medical expenses outside mainland China, including Hong Kong, Macau, and Taiwan.
- Items not payable under laws, regulations, policies, or documents.
- Bed-hanging hospitalization or refusing discharge after the hospital confirms discharge.
- Experimental or research treatments not scientifically or medically recognized.
- Treatments, drugs, or medicines not approved by the competent local authority.
- Medical appraisal fees.
- Plastic surgery, beauty surgery, gender reassignment surgery, and related complications.
- Prevention, fitness, recuperation, convalescence, medical consultation, health-care or non-disease treatment items.
- Functional assistive materials or rehabilitation devices.
- Organ-source related expenses in organ transplantation.

Drug-specific exclusions:

- Prescription is outside the relevant drug directory.
- Drug was not bought from the agreed hospital or pharmacy.
- Prescription quantity beyond one month.
- Prescription does not match approved indication, usage, or dosage.
- Medical evidence cannot prove the indication.
- Prescription was not issued by a designated specialist doctor at a designated outpatient visit.
- Reviewed as drug-resistant.
- Charitable assistance was available but the user did not apply or supplied incomplete materials, or passed assistance review but did not collect assistance drugs for personal reasons.

