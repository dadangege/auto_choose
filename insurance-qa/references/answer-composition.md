# Answer Composition

Use this file when rendering final prose plus JSON cards.

## Output Shape

Default shape:

1. Direct answer in 1-3 sentences.
2. One section per intent, in user order.
3. Each section contains:
   - a short heading or label
   - user-facing explanation
   - source/evidence note when useful
   - immediately adjacent fenced JSON card
4. End with the minimum next step only when missing information affects the result.

## Product Reader Mode

For product explanation or report-style answers, use this structure:

1. `先读结论`: directly answer what matters.
2. `保障地图`: which responsibility applies.
3. `版本入口`: ordinary/care/new-citizen gate.
4. `责任判断`: claim/drug/hospital/material judgment.
5. `证据链`: source anchors and rule basis.
6. `还需要确认`: only material missing information.

This borrows the nature-reader idea of source-grounded sections, but the output must remain
insurance-user friendly. Do not create academic prose if the user asked a simple claim question.

## Prose Rules

- Avoid guaranteed language such as "一定能赔" or "肯定赔".
- Prefer "可以申请/初步看支持/仍需确认" over absolute approval.
- State version-dependent assumptions visibly.
- Keep calculations transparent: formula, deductible, ratio, and result.
- When a condition is missing, say exactly what is missing and why it matters.
- Do not bury JSON at the end. Cards follow the paragraph they support.

## Multi-Intent Pattern

For `coverage_explanation + domestic_drug`:

```markdown
保障责任部分：...

```json
{ "type": "coveragecard", ... }
```

奥希替尼部分：...

```json
{ "type": "claimcard", ... }
```
```

For `hospital_self_pay + domestic_drug`:

```markdown
住院自费部分：...

```json
{ "type": "claimcard", ... }
```

药品部分：...

```json
{ "type": "claimcard", ... }
```
```
