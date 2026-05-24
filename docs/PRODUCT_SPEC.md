# Product Specification: Insurance QA Orchestrator

## 1. Product Goal

Insurance QA Orchestrator helps users ask natural-language insurance questions and receive clear answers plus frontend-renderable JSON cards.

The system is designed for multi-intent insurance questions such as:

```text
我买的是新市民版，保障责任都有什么。另外奥希替尼能不能报？
```

Expected output:

```text
保障责任部分：...

```json
{ "type": "coveragecard", "...": "..." }
```

药品报销部分：...

```json
{ "type": "claimcard", "...": "..." }
```
```

## 2. Core Principle

The system does not rely on multiple skills calling each other. Instead, one orchestrator coordinates deterministic modules:

```text
router -> slot extractor -> rules -> wiki retriever -> prompt builder -> validator -> renderer
```

This makes the LLM an expression layer rather than the only reasoning engine.

## 3. Main User Scenarios

### 3.1 Coverage Questions

Examples:

- 保障责任都有什么？
- 保额是多少？
- 有没有等待期？

Mapped domain:

```text
wiki/coverage.md
```

Frontend card:

```text
coveragecard
```

### 3.2 Drug Questions

Examples:

- 奥希替尼能不能报？
- 医生一次开两个月特药能全部赔吗？
- 这个药在哪里可以买？

Mapped domains:

```text
wiki/drug.md
wiki/hospital.md
wiki/exclusion.md
```

Frontend card:

```text
claimcard
```

### 3.3 Hospital Questions

Examples:

- 哪些医院能理赔？
- 药店范围是什么？
- 质子重离子要去哪里治疗？

Mapped domain:

```text
wiki/hospital.md
```

Frontend card:

```text
hospitalcard
```

### 3.4 Enrollment Questions

Examples:

- 我能不能买新市民版？
- 外卖员能投保吗？
- 关爱版适合什么人？

Mapped domain:

```text
wiki/enrollment.md
```

Frontend card:

```text
enrollmentcard
```

### 3.5 Claim Questions

Examples:

- 住院自费 3 万能赔多少？
- 没走当地医保还能赔吗？
- 需要什么理赔材料？

Mapped domains:

```text
wiki/claim.md
wiki/hospital.md
wiki/exclusion.md
```

Frontend cards:

```text
claimcard
materialcard
```

## 4. Orchestration Flow

### Step 1: Policy Selection

The router identifies:

- 普通版
- 关爱版
- 新市民版
- unclear version

If the user only says "沪惠保", the system does not default to ordinary version.

### Step 2: Intent Routing

One user message may generate multiple intents:

```json
[
  { "type": "coverage_explanation", "label": "保障责任部分" },
  { "type": "domestic_drug", "label": "药品报销部分" }
]
```

### Step 3: Slot Extraction

The slot extractor pulls fields such as:

```json
{
  "claim_amount": 30000,
  "drug_name": "甲磺酸奥希替尼片",
  "is_pre_existing": false,
  "local_medical_insurance_settled": false
}
```

### Step 4: Rule Engine

The rule engine handles deterministic facts before the LLM:

- New-citizen version without local medical insurance settlement: 20% / 10%.
- Basic annual deductible: 12000.
- Estimated payment calculation.
- Osimertinib directory hit.
- Prescription longer than one month exclusion.

### Step 5: Wiki Retrieval

The retriever selects only needed wiki domains.

Example:

```text
coverage_explanation + domestic_drug
  -> base
  -> policy
  -> render
  -> coverage
  -> drug
  -> exclusion
```

### Step 6: Prompt Builder

Fast Wiki mode sends:

```text
local orchestration result
selected wiki snippets
output contract
```

Full Skill mode sends:

```text
SKILL.md
reference files
local orchestration result
```

### Step 7: Validation

The validator checks:

- card count matches intent count
- supported card type
- required fields
- required claim_scene fields

### Step 8: Rendering

The frontend parses fenced JSON blocks and renders visual cards.

## 5. JSON Card Contract

Formal schema:

```text
insurance-qa/schemas/cards.schema.json
```

Supported cards:

- `claimcard`
- `coveragecard`
- `policyselectcard`
- `materialcard`
- `hospitalcard`
- `enrollmentcard`

## 6. Performance Strategy

The system is fast because it avoids sending all policy context to the LLM.

Before:

```text
Full skill files -> LLM
```

Now:

```text
local orchestration -> selected wiki snippets -> LLM
```

Benefits:

- Smaller prompt
- Lower latency
- Lower token cost
- More deterministic results
- Easier testing

## 7. Frontend Test Console

The local web console supports:

- API key input
- Fast Wiki / Full Skill toggle
- streaming output
- first-token and total timing statistics
- prompt size statistics
- raw JSON folding
- visual card rendering
- demo card preview

## 8. Current Limitations

- The router and slot extractor are keyword/rule based.
- Wiki retrieval is domain based, not vector search.
- Raw Word terms are not automatically chunked into a searchable knowledge base.
- LLM output is still used for final prose and JSON emission.
- Schema validation currently checks local rule-generated cards; LLM-emitted cards are parsed by frontend but not yet server-repaired.

## 9. Recommended Next Steps

1. Add server-side validation and repair for LLM-emitted JSON cards.
2. Convert raw Word policy files into normalized markdown chunks.
3. Add vector or BM25 retrieval for detailed clauses.
4. Add test fixtures for each card type.
5. Add API endpoints for production integration.
6. Add authentication and API key storage outside the browser for deployment.

