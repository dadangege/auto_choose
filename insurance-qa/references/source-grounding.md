# Source Grounding

Use this file when an answer needs traceability to policy rules or raw product documents.

## Anchor Types

- `P###`: product/version and eligibility facts.
- `C###`: coverage responsibility, amount, deductible, and ratio facts.
- `D###`: drug directory, indication, prescription, and channel facts.
- `H###`: hospital, pharmacy, treatment institution, or purchase-channel facts.
- `R###`: reimbursement calculation, claim material, or process facts.
- `E###`: exclusion or responsibility-limit facts.

Anchors are not legal citations. They are stable internal evidence labels for the answer and
frontend. Use them only when they correspond to known wiki/raw-document facts.

## Grounding Rules

- First retrieve the smallest relevant wiki/domain context.
- If the answer depends on exact wording, drug indication, exclusion, or directory membership,
  verify against raw product documents when available.
- Do not cite an anchor for a fact that was inferred by the model.
- If evidence is incomplete, mark the answer as "待确认" and add missing information.
- A source anchor should support one factual claim, not a whole paragraph.

## Default Anchors For Current Hu Hui Bao Rules

- `P001`: 三版分别为普通版、关爱版、新市民版，入口人群不同。
- `P002`: 泛称 "沪惠保" 不能默认成普通版。
- `C001`: 主要责任包括住院自费、国内特药、质子重离子、海外特殊药品、CAR-T。
- `C002`: 住院及国内特药保额100万；质子重离子30万；海外特殊药品30万；CAR-T 50万。
- `R001`: 住院责任基础免赔额按12000元估算；连续投保无理赔可能降低。
- `R002`: 新市民版未走当地医保时，非既往症20%，既往症10%。
- `D001`: 泰瑞沙/甲磺酸奥希替尼片在三版国内特定高额药品目录中。
- `D002`: 奥希替尼仍需核适应病种、适应症、处方医生、购药渠道、医保报销、慈善援助和耐药。
- `H001`: 不同责任对应不同医院、药店或治疗机构范围。
- `E001`: 国内特药和海外特殊药品每次处方超过一个月以上部分不承担给付责任。

## Evidence Card Guidance

Use an `evidencecard` or prose evidence note when:

- the user is likely to confuse directory hit with reimbursability;
- a payout estimate relies on deductible and ratio;
- a version gate changes the conclusion;
- an exclusion or prescription limit is decisive.
