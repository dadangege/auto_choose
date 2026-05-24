# Policy Selection Rules

Use these rules before answering any concrete insurance responsibility, claim, drug, hospital, payout ratio, deductible, material, exclusion, or coverage question.

## Confirmed Versions

Treat the version as confirmed only when the user clearly names it or provides equivalent context:

- Ordinary version: "普通版", "沪惠保普通版", "2025版沪惠保普通版", or clear Shanghai basic medical insurance context such as "上海医保卡" or "上海市基本医疗保险".
- Care version: "关爱版", "沪惠保关爱版", "社区医疗互助帮困计划", "医疗互助帮困计划", "互助帮困", or "帮困计划".
- New-citizen version: "新市民版", "沪惠保新市民版", "新市民", "外卖", "快递", "物流", "大型企业务工人员", "当地医保", "非上海医保", or "未经当地医保结算".

Do not treat generic "2025版沪惠保" as ordinary version unless the ordinary-version context above is also present.

## Need User Selection

If the user only says "沪惠保" or gives no product version, ask the user to choose a version when the question involves:

- Hospitalization self-pay expenses.
- Medical insurance settlement prerequisites.
- Mutual-aid subsidy.
- Local medical insurance settlement.
- Pre-existing condition definition.
- Eligible insured population.
- Payout ratio differences.
- Claim prerequisites.

Use this user-facing message:

这个问题需要先确认你买的是哪一版沪惠保：普通版、关爱版，还是新市民版。三版在投保人群、住院理赔前置条件和既往症定义上不完全一样。

## Structured Result

If confirmed:

```json
{
  "policy_status": "confirmed",
  "policy_name": "2025版沪惠保",
  "policy_version": "普通版/关爱版/新市民版"
}
```

If selection is needed:

```json
{
  "policy_status": "need_select",
  "reason": "用户只提到沪惠保，但该问题涉及版本差异。",
  "candidates": [
    {
      "policy_name": "2025版沪惠保",
      "policy_version": "普通版",
      "description": "适用于参加上海市基本医疗保险的在保人员"
    },
    {
      "policy_name": "2025版沪惠保",
      "policy_version": "关爱版",
      "description": "适用于参加上海市市民社区医疗互助帮困计划的人员"
    },
    {
      "policy_name": "2025版沪惠保",
      "policy_version": "新市民版",
      "description": "适用于在上海部分大型企业工作并参加当地基本医保的务工人员"
    }
  ]
}
```

