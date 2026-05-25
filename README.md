# Insurance QA Orchestrator

Insurance QA Orchestrator is a local prototype for policy Q&A over the 2025 Hu Hui Bao product family. It turns free-form user questions into structured insurance answers by combining deterministic orchestration, domain wiki retrieval, LLM generation, and frontend JSON card rendering.

## What It Does

- Detects the product version: ordinary, care, or new-citizen.
- Splits one user message into multiple business intents.
- Extracts slots such as amount, drug name, medical insurance settlement, and pre-existing condition status.
- Runs deterministic rules before calling the LLM.
- Retrieves only relevant wiki snippets instead of sending all skill files.
- Streams LLM output to the browser.
- Renders JSON blocks as visual cards for the frontend.

## Architecture

```text
User question
  -> orchestrator/router.js
  -> orchestrator/slot-extractor.js
  -> orchestrator/rules.js
  -> orchestrator/wiki.js
  -> orchestrator/prompt-builder.js
  -> LLM
  -> orchestrator/validator.js
  -> web card renderer
```

## Project Layout

```text
insurance-qa/
  SKILL.md
  orchestrator/
    index.js
    router.js
    slot-extractor.js
    rules.js
    wiki.js
    prompt-builder.js
    validator.js
  wiki/
    coverage.md
    drug.md
    hospital.md
    enrollment.md
    claim.md
    policy.md
    exclusion.md
    render.md
  schemas/
    cards.schema.json
  web/
    server.js
    public/
  scripts/
    test_orchestrator.js
    test_orchestrator.py
    real_llm_test.py
RAW_File/
insurance_skills/
```

## Run Locally

```bash
node insurance-qa/web/server.js
```

Open:

```text
http://localhost:4173
```

The browser UI supports:

- Fast Wiki mode
- Full Skill mode
- Two-stage planning/rendering mode
- Streaming MiniMax output
- Timing statistics
- Visual card rendering
- Card preview without an API key

## MiniMax

The web UI accepts:

- Base URL: `https://api.minimaxi.com/v1`
- Model: `MiniMax-M2.7`
- API key: paste locally in the browser

The key is not written to project files.

## Tests

```bash
node insurance-qa/scripts/test_orchestrator.js
python3 insurance-qa/scripts/test_orchestrator.py
python3 -m json.tool insurance-qa/schemas/cards.schema.json >/dev/null
```

## Product Notes

See [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md).

## Progress Notes

- [2026-05-25 evening progress](docs/PROGRESS_2026-05-25.md)
