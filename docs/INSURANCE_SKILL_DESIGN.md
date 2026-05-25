# Insurance Skill Design

## Goal

Turn insurance Q&A into a source-grounded, card-oriented workflow:

```text
user question
-> policy gate
-> intent split
-> slot extraction
-> rule judgment
-> card plan
-> grounded answer composition
-> JSON card rendering
```

The skill should not be a generic Markdown answer generator. It should decide which
cards are useful, bind facts to evidence anchors, and keep every prose block adjacent
to its JSON display contract.

## Borrowed From Nature Skills

The useful pattern from `nature-reader` / `nature-writing` is:

- `SKILL.md` is the workflow controller, not the whole knowledge base.
- detailed rules live in `references/`.
- source grounding comes before fluent writing.
- output is an artifact bundle, not just chat text.
- missing information is visible, not silently filled in.

For insurance, the artifact bundle is:

- user-facing answer text
- `cards.json`-like fenced JSON blocks
- source anchors such as `P001`, `C001`, `D001`, `R002`
- frontend card rendering

## Skill Structure

```text
insurance-qa/
├── SKILL.md
├── references/
│   ├── policy-select.md
│   ├── intent-routing.md
│   ├── card-taxonomy.md
│   ├── source-grounding.md
│   ├── claim-judge.md
│   ├── answer-render.md
│   └── answer-composition.md
├── wiki/
├── orchestrator/
│   ├── router.js
│   ├── slot-extractor.js
│   ├── rules.js
│   ├── card-planner.js
│   ├── validator.js
│   └── prompt-builder.js
└── schemas/cards.schema.json
```

## Card Planning

Each intent gets:

- `primary_card`: the main display artifact
- `supporting_cards`: optional cards for version comparison, evidence, drug checks, or next steps
- `answer_job`: what the prose must accomplish
- `source_anchors`: stable factual anchors

Example for:

```text
我买的是新市民版，住院自费3万，没走当地医保，我不是既往症。另外奥希替尼能不能报？
```

Expected plan:

```text
hospital_self_pay
  primary: claimcard
  support: evidencecard, nextstepcard
  anchors: R001, R002

domestic_drug
  primary: claimcard
  support: drugcheckcard, evidencecard, nextstepcard
  anchors: D001, D002
```

## Answer Composition

The final answer should keep this shape:

```text
direct answer

intent A prose
intent A JSON card
intent A supporting JSON card if useful

intent B prose
intent B JSON card
intent B supporting JSON card if useful

short shared reminder
```

Report mode can use:

```text
先读结论
保障地图
版本入口
责任判断
证据链
还需要确认
```

But the model must still follow the card plan and avoid unsupported claims.

## Key Guardrails

- Do not default generic "沪惠保" to ordinary version.
- Do not turn a drug directory hit into a guaranteed reimbursement conclusion.
- Do not let missing information for one intent block independent intents.
- Do not place all JSON at the end.
- Do not invent amounts, ratios, indications, hospitals, or exclusions.
- Use the closest existing renderable card if a semantic card is not supported yet.
