# Runbook

## Start

```bash
node insurance-qa/web/server.js
```

Open:

```text
http://localhost:4173
```

## Test

```bash
node insurance-qa/scripts/test_orchestrator.js
python3 insurance-qa/scripts/test_orchestrator.py
python3 -m json.tool insurance-qa/schemas/cards.schema.json >/dev/null
```

## MiniMax

Use the browser form:

- Base URL: `https://api.minimaxi.com/v1`
- Model: `MiniMax-M2.7`
- API key: paste locally

The key is only sent to the local Node proxy and then to MiniMax.

## Common Issues

### Port Already In Use

```bash
lsof -ti tcp:4173
```

Stop the previous Node process, then restart.

### Slow Response

Use Fast Wiki mode. It sends only selected wiki snippets instead of full skill files.

### JSON Card Does Not Render

Check that the LLM output contains fenced JSON:

````markdown
```json
{ "type": "claimcard" }
```
````

The frontend parses only fenced `json` blocks.

