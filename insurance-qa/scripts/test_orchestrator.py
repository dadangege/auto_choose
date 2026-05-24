#!/usr/bin/env python3
"""Deterministic smoke tests for the insurance-qa skill orchestration.

This does not call an LLM. It verifies the routing contract that the skill asks
the model or application layer to follow: select policy, split intents, judge
each intent independently, and preserve partial answers in multi-intent cases.
"""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]


@dataclass
class PolicyResult:
    status: str
    version: str | None = None
    reason: str | None = None


@dataclass
class Intent:
    type: str
    label: str


def select_policy(query: str) -> PolicyResult:
    ordinary_markers = ["普通版", "上海医保卡", "上海基本医保", "上海市基本医疗保险"]
    care_markers = ["关爱版", "互助帮困", "帮困计划", "社区医疗互助"]
    new_citizen_markers = [
        "新市民版",
        "新市民",
        "外卖",
        "快递",
        "物流",
        "大型企业",
        "当地医保",
        "非上海医保",
        "没走当地医保",
        "未走当地医保",
        "未经当地医保",
    ]

    if any(marker in query for marker in care_markers):
        return PolicyResult(status="confirmed", version="关爱版")
    if any(marker in query for marker in new_citizen_markers):
        return PolicyResult(status="confirmed", version="新市民版")
    if any(marker in query for marker in ordinary_markers):
        return PolicyResult(status="confirmed", version="普通版")

    if "沪惠保" in query or "2025版沪惠保" in query:
        return PolicyResult(
            status="need_select",
            reason="用户提到沪惠保，但未明确普通版、关爱版或新市民版。",
        )

    return PolicyResult(status="need_select", reason="用户未提供明确产品版本。")


def split_intents(query: str) -> list[Intent]:
    candidates: list[tuple[int, Intent]] = []

    patterns = [
        ("hospital_self_pay", "住院自费部分", ["住院", "自费", "没走医保", "未走医保", "没走当地医保", "未走当地医保", "赔多少"]),
        ("hospital_scope", "医院范围部分", ["医院", "医院范围", "定点医院", "普通住院部", "药店", "购药渠道", "哪里买药", "哪里治疗"]),
        ("materials", "理赔材料部分", ["材料", "资料", "申请理赔", "怎么申请"]),
        ("enrollment", "投保相关部分", ["投保", "参保", "能买吗", "能不能买", "怎么买", "投保范围", "人群", "资格", "保费", "等待期", "保险期间"]),
        ("coverage_explanation", "保障责任部分", ["保障责任", "保险责任", "责任都有什么", "保障都有什么", "保什么", "保障范围", "保额", "等待期", "除外责任", "免责条款"]),
    ]

    for intent_type, label, words in patterns:
        indexes = [query.find(word) for word in words if word in query]
        if indexes:
            candidates.append((min(indexes), Intent(type=intent_type, label=label)))

    drug_words = ["药", "奥希替尼", "泰瑞沙", "处方", "药店", "购药"]
    drug_indexes = [query.find(word) for word in drug_words if word in query]
    if drug_indexes:
        if "两个月" in query or "2个月" in query or "超过一个月" in query:
            candidates.append((min(drug_indexes), Intent(type="drug_prescription_duration", label="处方时长部分")))
        else:
            candidates.append((min(drug_indexes), Intent(type="domestic_drug", label="药品报销部分")))

    intents = [intent for _, intent in sorted(candidates, key=lambda item: item[0])]
    deduped: list[Intent] = []
    seen: set[str] = set()
    for intent in intents:
        if intent.type == "hospital_scope" and "domestic_drug" in seen:
            continue
        if intent.type not in seen:
            seen.add(intent.type)
            deduped.append(intent)
    intents = deduped

    if not intents:
        intents.append(Intent(type="coverage_explanation", label="保障解释部分"))

    deduped: list[Intent] = []
    seen: set[tuple[str, str]] = set()
    for intent in intents:
        key = (intent.type, intent.label)
        if key not in seen:
            seen.add(key)
            deduped.append(intent)
    return deduped


def money_amount(query: str) -> int | None:
    match = re.search(r"(\d+(?:\.\d+)?)\s*万", query)
    if match:
        return int(float(match.group(1)) * 10000)
    match = re.search(r"(\d+)\s*元", query)
    if match:
        return int(match.group(1))
    return None


def pre_existing_status(query: str) -> str:
    if "不是既往症" in query or "非既往症" in query:
        return "non_pre_existing"
    if "既往症" in query:
        return "pre_existing"
    return "unknown"


def judge_hospital(query: str, policy: PolicyResult) -> dict[str, Any]:
    version = policy.version
    amount = money_amount(query)
    pre_existing = pre_existing_status(query)
    no_local_settlement = any(token in query for token in ["没走当地医保", "未走当地医保", "未经当地医保"])
    no_shanghai_settlement = any(token in query for token in ["没走上海医保", "未走上海医保", "没用上海医保卡"])

    card: dict[str, Any] = {
        "type": "claimcard",
        "claim_scene": {
            "claim_type": "住院自费医疗费用理赔",
            "coverage_name": "特定住院自费医疗费用保险金",
            "support_status": "待确认",
            "confidence": "中",
            "reason": "",
        },
        "conditions": [],
        "missing_info": [],
        "notes": [],
    }

    if version == "新市民版":
        if no_local_settlement:
            ratio = "20%" if pre_existing != "pre_existing" else "10%"
            card["claim_scene"]["support_status"] = "支持"
            card["claim_scene"]["reason"] = "新市民版未经当地医保结算仍可申请，但赔付比例降低。"
            card["conditions"].append(
                {
                    "name": "当地医保结算",
                    "status": "未满足",
                    "description": f"适用降低后的赔付比例：{ratio}。",
                }
            )
        else:
            ratio = "70%" if pre_existing != "pre_existing" else "50%"
            card["claim_scene"]["support_status"] = "待确认"
            card["claim_scene"]["reason"] = "需确认是否已经经当地基本医保结算。"
            card["missing_info"].append("是否已经经当地基本医疗保险结算")

        if amount is not None and no_local_settlement and pre_existing != "unknown":
            deductible = 12000
            numeric_ratio = 0.2 if pre_existing == "non_pre_existing" else 0.1
            result = max(0, amount - deductible) * numeric_ratio
            card["estimated_payment"] = {
                "claim_amount": amount,
                "deductible": deductible,
                "pay_ratio": ratio,
                "estimated_result": int(result),
                "calculation_note": f"按基础免赔额12000元估算：({amount}-12000)×{ratio}={int(result)}元。",
            }
    elif version == "关爱版":
        card["claim_scene"]["support_status"] = "待确认"
        card["claim_scene"]["reason"] = "关爱版住院责任需先获得上海市市民社区医疗互助帮困计划医疗费用补助。"
        if "已获得" in query or "拿到" in query:
            card["conditions"].append(
                {
                    "name": "互助帮困补助",
                    "status": "已满足",
                    "description": "用户描述已获得互助帮困计划医疗费用补助。",
                }
            )
        else:
            card["missing_info"].append("是否已获得上海市市民社区医疗互助帮困计划医疗费用补助")
    elif version == "普通版":
        if no_shanghai_settlement:
            card["claim_scene"]["support_status"] = "待确认"
            card["claim_scene"]["reason"] = "普通版需经上海基本医疗保险结算后方可申请住院自费责任理赔。"
            card["missing_info"].append("是否已经补做上海基本医疗保险结算")
        else:
            card["claim_scene"]["support_status"] = "待确认"
            card["claim_scene"]["reason"] = "普通版住院责任需确认上海医保结算、医院范围、费用范围和既往症状态。"
            card["missing_info"].extend(["是否经上海基本医疗保险结算", "是否属于特定住院自费医疗费用"])
    else:
        card["claim_scene"]["reason"] = "产品版本未确认。"

    if pre_existing == "unknown":
        card["missing_info"].append("是否属于既往症人群")
    card["missing_info"].extend(["住院医院是否符合条款要求", "费用是否属于特定住院自费医疗费用"])
    return card


def judge_drug(query: str, policy: PolicyResult) -> dict[str, Any]:
    has_osimertinib = "奥希替尼" in query or "泰瑞沙" in query
    card = {
        "type": "claimcard",
        "claim_scene": {
            "claim_type": "国内特定高额药品费用理赔",
            "coverage_name": "国内特定高额药品费用保险金",
            "support_status": "待确认",
            "confidence": "中",
            "reason": "",
        },
        "conditions": [],
        "missing_info": [],
        "notes": [],
    }

    if has_osimertinib:
        card["claim_scene"]["reason"] = "泰瑞沙/甲磺酸奥希替尼片在三版国内特定高额药品目录中，但仍需确认适应症、处方医生和购药渠道。"
        card["conditions"].append(
            {
                "name": "药品目录",
                "status": "已满足",
                "description": "原始产品说明书目录中包含泰瑞沙/甲磺酸奥希替尼片。",
            }
        )
        card["missing_info"].extend(
            [
                "是否为目录约定的肺癌适应病种和适应症",
                "是否由指定专科医生开具处方",
                "是否在约定医院门诊或合规药店购买",
                "是否已获医保报销",
                "是否涉及慈善援助或耐药",
            ]
        )
    else:
        card["claim_scene"]["reason"] = "需要先确认药品是否在对应版本的国内特定高额药品目录内。"
        card["missing_info"].extend(["药品名称", "是否在药品目录", "适应症", "处方和购药渠道"])

    if policy.version:
        card["conditions"].insert(
            0,
            {
                "name": "产品版本",
                "status": "已满足",
                "description": f"按2025版沪惠保{policy.version}判断。",
            },
        )
    return card


def judge_prescription_duration() -> dict[str, Any]:
    return {
        "type": "claimcard",
        "claim_scene": {
            "claim_type": "特定高额药品费用理赔",
            "coverage_name": "国内特定高额药品费用保险金/海外特殊药品费用保险金",
            "support_status": "不支持",
            "confidence": "高",
            "reason": "每次药品处方超过一个月以上部分的药品费用属于责任免除范围。",
        },
        "conditions": [
            {
                "name": "处方时长",
                "status": "未满足",
                "description": "用户描述一次开具两个月处方，超过一个月以上部分不支持。",
            }
        ],
        "missing_info": [],
        "notes": [],
    }


def judge_intent(query: str, policy: PolicyResult, intent: Intent) -> dict[str, Any]:
    if policy.status != "confirmed":
        return {
            "type": "policyselectcard",
            "title": "请选择保险产品版本",
            "reason": policy.reason,
            "intent": asdict(intent),
            "options": [
                {"policy_name": "2025版沪惠保", "policy_version": "普通版"},
                {"policy_name": "2025版沪惠保", "policy_version": "关爱版"},
                {"policy_name": "2025版沪惠保", "policy_version": "新市民版"},
            ],
        }

    if intent.type == "hospital_self_pay":
        return judge_hospital(query, policy)
    if intent.type == "domestic_drug":
        return judge_drug(query, policy)
    if intent.type == "drug_prescription_duration":
        return judge_prescription_duration()
    if intent.type == "materials":
        return {
            "type": "materialcard",
            "claim_type": "理赔材料",
            "materials": [],
            "missing_info": ["具体理赔责任类型"],
        }
    if intent.type == "hospital_scope":
        return {
            "type": "hospitalcard",
            "title": "医院和药店范围",
            "scopes": [
                {"name": "住院责任", "description": "通常要求二级及以上医保定点医院普通住院部。"},
                {"name": "国内特药", "description": "上海市二级及以上医院门诊或上海市具备销售药品资质的药店。"},
            ],
            "notes": ["具体范围需结合责任和版本确认"],
        }
    if intent.type == "enrollment":
        return {
            "type": "enrollmentcard",
            "title": "投保相关",
            "eligible_groups": ["普通版：上海基本医保参保人员", "关爱版：互助帮困计划参加人员", "新市民版：上海部分大型企业工作且参加当地医保的务工人员"],
            "requirements": ["需确认具体版本和用户身份"],
            "notes": [],
        }
    if intent.type == "coverage_explanation":
        return {
            "type": "coveragecard",
            "coverage": {
                "name": "2025版沪惠保保障责任概览",
                "summary": "主要包括特定住院自费医疗费用、国内特定高额药品、质子重离子、海外特殊药品和CAR-T治疗药品五项责任。",
                "insured_amount": "住院及国内特药100万；质子重离子30万；海外特殊药品30万；CAR-T 50万。",
                "deductible": "住院责任有年度免赔额，其他四项通常0免赔。",
                "pay_ratio": "需结合责任、版本和既往症状态判断。",
                "hospital_scope": "按各责任约定的医院或药店范围执行。",
                "key_limits": ["三版住院理赔前置条件不同", "药品责任需符合目录、适应症、处方和购药渠道"],
            },
        }
    return {
        "type": "coveragecard",
        "coverage": {
            "name": "2025版沪惠保",
            "summary": "需要结合具体问题和版本解释保障责任。",
        },
    }


def orchestrate(query: str) -> dict[str, Any]:
    policy = select_policy(query)
    intents = split_intents(query)
    cards = [judge_intent(query, policy, intent) for intent in intents]
    return {
        "query": query,
        "policy": asdict(policy),
        "intents": [asdict(intent) for intent in intents],
        "cards": cards,
    }


CASES = [
    {
        "name": "generic_huhuibao_requires_selection",
        "query": "我买了沪惠保，住院自费能不能赔？",
        "expect": {
            "policy_status": "need_select",
            "intent_count": 1,
            "card_types": ["policyselectcard"],
        },
    },
    {
        "name": "new_citizen_hospital_and_drug_multi_intent",
        "query": "我买的是新市民版，住院自费3万，没走当地医保，我不是既往症。另外奥希替尼能不能报？",
        "expect": {
            "policy_status": "confirmed",
            "policy_version": "新市民版",
            "intent_types": ["hospital_self_pay", "domestic_drug"],
            "support_statuses": ["支持", "待确认"],
            "estimated_result": 3600,
        },
    },
    {
        "name": "care_version_uses_mutual_aid_requirement",
        "query": "我买的是关爱版，住院自费能不能赔？还没有拿到互助帮困补助。",
        "expect": {
            "policy_status": "confirmed",
            "policy_version": "关爱版",
            "contains_missing": "互助帮困计划",
        },
    },
    {
        "name": "drug_prescription_over_one_month",
        "query": "我买的是普通版，医生一次给我开了两个月特药处方，沪惠保能全部赔吗？",
        "expect": {
            "policy_status": "confirmed",
            "policy_version": "普通版",
            "support_statuses": ["不支持"],
        },
    },
    {
        "name": "coverage_then_drug_multi_intent",
        "query": "我买的是新市民版，保障责任都有什么。另外奥希替尼能不能报？",
        "expect": {
            "policy_status": "confirmed",
            "policy_version": "新市民版",
            "intent_types": ["coverage_explanation", "domestic_drug"],
            "card_types": ["coveragecard", "claimcard"],
        },
    },
]


def check_case(case: dict[str, Any]) -> list[str]:
    result = orchestrate(case["query"])
    expect = case["expect"]
    errors: list[str] = []

    if result["policy"]["status"] != expect.get("policy_status", result["policy"]["status"]):
        errors.append(f"policy status expected {expect['policy_status']}, got {result['policy']['status']}")
    if "policy_version" in expect and result["policy"].get("version") != expect["policy_version"]:
        errors.append(f"policy version expected {expect['policy_version']}, got {result['policy'].get('version')}")
    if "intent_count" in expect and len(result["intents"]) != expect["intent_count"]:
        errors.append(f"intent count expected {expect['intent_count']}, got {len(result['intents'])}")
    if "intent_types" in expect:
        got = [intent["type"] for intent in result["intents"]]
        if got != expect["intent_types"]:
            errors.append(f"intent types expected {expect['intent_types']}, got {got}")
    if "card_types" in expect:
        got = [card["type"] for card in result["cards"]]
        if got != expect["card_types"]:
            errors.append(f"card types expected {expect['card_types']}, got {got}")
    if "support_statuses" in expect:
        got = [card.get("claim_scene", {}).get("support_status") for card in result["cards"] if "claim_scene" in card]
        if got != expect["support_statuses"]:
            errors.append(f"support statuses expected {expect['support_statuses']}, got {got}")
    if "estimated_result" in expect:
        got_results = [
            card.get("estimated_payment", {}).get("estimated_result")
            for card in result["cards"]
            if "estimated_payment" in card
        ]
        if expect["estimated_result"] not in got_results:
            errors.append(f"estimated result expected {expect['estimated_result']}, got {got_results}")
    if "contains_missing" in expect:
        serialized = json.dumps(result, ensure_ascii=False)
        if expect["contains_missing"] not in serialized:
            errors.append(f"expected serialized result to contain {expect['contains_missing']!r}")

    return errors


def run_cases() -> int:
    failures = 0
    for case in CASES:
        errors = check_case(case)
        if errors:
            failures += 1
            print(f"FAIL {case['name']}")
            for error in errors:
                print(f"  - {error}")
        else:
            print(f"PASS {case['name']}")
    return failures


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--query", help="Run orchestration for one ad hoc query.")
    parser.add_argument("--json", action="store_true", help="Print JSON for --query.")
    args = parser.parse_args()

    if args.query:
        result = orchestrate(args.query)
        if args.json:
            print(json.dumps(result, ensure_ascii=False, indent=2))
        else:
            print(f"policy: {result['policy']}")
            print(f"intents: {result['intents']}")
            print(f"cards: {len(result['cards'])}")
        return 0

    return 1 if run_cases() else 0


if __name__ == "__main__":
    raise SystemExit(main())
