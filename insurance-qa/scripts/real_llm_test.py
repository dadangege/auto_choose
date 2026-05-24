#!/usr/bin/env python3
"""Run real LLM tests for the insurance-qa skill with an OpenAI-compatible API.

MiniMax usage:
  export MINIMAX_API_KEY='...'
  python3 insurance-qa/scripts/real_llm_test.py --query '我买的是新市民版，住院自费3万，没走当地医保，我不是既往症。另外奥希替尼能不能报？'

Optional env vars:
  MINIMAX_BASE_URL, default https://api.minimax.io/v1
  MINIMAX_MODEL, default MiniMax-M2.7
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


SKILL_DIR = Path(__file__).resolve().parents[1]
DEFAULT_CASES = [
    "我买了沪惠保，住院自费能不能赔？",
    "我买的是新市民版，住院自费3万，没走当地医保，我不是既往症。另外奥希替尼能不能报？",
    "我买的是关爱版，住院自费能不能赔？还没有拿到互助帮困补助。",
    "我买的是普通版，医生一次给我开了两个月特药处方，沪惠保能全部赔吗？",
]


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def build_system_prompt() -> str:
    parts = [
        ("SKILL.md", read_text(SKILL_DIR / "SKILL.md")),
        ("references/policy-select.md", read_text(SKILL_DIR / "references" / "policy-select.md")),
        ("references/claim-judge.md", read_text(SKILL_DIR / "references" / "claim-judge.md")),
        ("references/answer-render.md", read_text(SKILL_DIR / "references" / "answer-render.md")),
    ]
    joined = "\n\n".join(f"===== {name} =====\n{content}" for name, content in parts)
    return f"""你是保险问答测试助手。严格按照下面的 insurance-qa skill 与 reference 规则回答用户。

要求：
1. 先做产品版本选择。
2. 如果用户一句话包含多个问题，先拆分意图，再分别判断。
3. 不要把多个意图混成一个结论。
4. 如果产品版本不明确且涉及版本差异，必须要求用户选择版本。
5. 最终回答使用中文 Markdown，并在适合时输出 fenced json 卡片。
6. 多意图问题必须按“内容 + json + 内容 + json”的顺序输出：每个意图先给对应文字解释，紧跟该意图自己的 fenced json，不要先输出整体内容再集中输出所有 JSON。
7. 不要输出你的思考过程。

{joined}
"""


def strip_thinking(content: str) -> str:
    return re.sub(r"<think>.*?</think>\s*", "", content, flags=re.DOTALL).strip()


def chat_completion(
    api_key: str,
    query: str,
    base_url: str,
    model: str,
    temperature: float,
    max_completion_tokens: int,
) -> dict[str, Any]:
    url = base_url.rstrip("/") + "/chat/completions"
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": build_system_prompt()},
            {"role": "user", "content": query},
        ],
        "temperature": temperature,
        "max_completion_tokens": max_completion_tokens,
    }
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code}: {body}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Request failed: {exc}") from exc


def extract_content(response: dict[str, Any]) -> str:
    try:
        return response["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise RuntimeError(f"Unexpected response shape: {json.dumps(response, ensure_ascii=False)[:1000]}") from exc


def run_one(query: str, args: argparse.Namespace) -> int:
    response = chat_completion(
        api_key=args.api_key,
        query=query,
        base_url=args.base_url,
        model=args.model,
        temperature=args.temperature,
        max_completion_tokens=args.max_completion_tokens,
    )
    content = strip_thinking(extract_content(response))
    print("=" * 80)
    print(f"QUERY: {query}")
    print("-" * 80)
    print(content)
    if args.show_usage and "usage" in response:
        print("-" * 80)
        print(json.dumps(response["usage"], ensure_ascii=False, indent=2))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--query", help="Run one custom query.")
    parser.add_argument("--cases", action="store_true", help="Run built-in insurance QA cases.")
    parser.add_argument("--base-url", default=os.environ.get("MINIMAX_BASE_URL", "https://api.minimax.io/v1"))
    parser.add_argument("--model", default=os.environ.get("MINIMAX_MODEL", "MiniMax-M2.7"))
    parser.add_argument("--api-key", default=os.environ.get("MINIMAX_API_KEY"))
    parser.add_argument("--temperature", type=float, default=0.2)
    parser.add_argument("--max-completion-tokens", type=int, default=2048)
    parser.add_argument("--show-usage", action="store_true")
    args = parser.parse_args()

    if not args.api_key:
        print("Missing API key. Set MINIMAX_API_KEY or pass --api-key.", file=sys.stderr)
        return 2

    queries = DEFAULT_CASES if args.cases else [args.query]
    if not queries or not queries[0]:
        parser.error("Provide --query or --cases.")

    for query in queries:
        run_one(query, args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
