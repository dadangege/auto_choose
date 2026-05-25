function versionCompareCard() {
  return {
    type: "versioncomparecard",
    title: "三版入口差异",
    versions: [
      {
        version: "普通版",
        entry: "上海基本医保参保人员",
        claim_gate: "住院责任需经上海基本医疗保险结算",
      },
      {
        version: "关爱版",
        entry: "上海市市民社区医疗互助帮困计划参加人员",
        claim_gate: "住院责任需先获得互助帮困计划医疗费用补助",
      },
      {
        version: "新市民版",
        entry: "上海部分大型企业工作且参加当地医保的务工人员",
        claim_gate: "当地医保结算影响住院赔付比例",
      },
    ],
    source_anchors: ["P001", "P002"],
  };
}

function evidenceCard(title, anchors) {
  const facts = {
    P001: "普通版、关爱版、新市民版入口人群不同。",
    P002: "泛称沪惠保不能默认成普通版。",
    C001: "主要责任包括住院自费、国内特药、质子重离子、海外特殊药品、CAR-T。",
    C002: "住院及国内特药保额100万；质子重离子30万；海外特殊药品30万；CAR-T 50万。",
    R001: "住院责任基础免赔额按12000元估算，连续投保无理赔可能降低。",
    R002: "新市民版未走当地医保时，非既往症20%，既往症10%。",
    D001: "泰瑞沙/甲磺酸奥希替尼片在三版国内特定高额药品目录中。",
    D002: "奥希替尼仍需核适应病种、适应症、处方医生、购药渠道、医保报销、慈善援助和耐药。",
    H001: "不同责任对应不同医院、药店或治疗机构范围。",
    E001: "国内特药和海外特殊药品每次处方超过一个月以上部分不承担给付责任。",
  };
  return {
    type: "evidencecard",
    title,
    anchors: anchors.map(id => ({ id, fact: facts[id] || "待补充来源事实" })),
  };
}

function nextStepCard(items) {
  return {
    type: "nextstepcard",
    title: "还需要确认",
    items: [...new Set(items)].filter(Boolean),
  };
}

function drugCheckCard(policy, slots) {
  const hasOsimertinib = slots.drug_name === "甲磺酸奥希替尼片";
  return {
    type: "drugcheckcard",
    title: hasOsimertinib ? "奥希替尼报销条件检查" : "特药报销条件检查",
    drug_name: slots.drug_name || "待确认药品名称",
    directory_status: hasOsimertinib ? "目录内" : "待确认",
    policy_version: policy.version || "待确认",
    checks: [
      { name: "药品目录", status: hasOsimertinib ? "已满足" : "待确认" },
      { name: "适应病种和适应症", status: "待确认" },
      { name: "指定专科医生处方", status: "待确认" },
      { name: "购药渠道", status: "待确认" },
      { name: "医保报销/慈善援助/耐药", status: "待确认" },
    ],
    source_anchors: hasOsimertinib ? ["D001", "D002"] : ["D002"],
  };
}

function exclusionCard(title, anchors, reason) {
  return {
    type: "exclusioncard",
    title,
    reason,
    source_anchors: anchors,
  };
}

function sourceAnchorsForIntent(intent, route, slots) {
  if (route.policy.status !== "confirmed") return ["P002"];
  if (intent.type === "coverage_explanation") return ["C001", "C002", "P001"];
  if (intent.type === "version_comparison") return ["P001", "P002"];
  if (intent.type === "hospital_self_pay") {
    const anchors = ["R001"];
    if (route.policy.version === "新市民版" && slots.local_medical_insurance_settled === false) anchors.push("R002");
    return anchors;
  }
  if (intent.type === "domestic_drug") return slots.drug_name === "甲磺酸奥希替尼片" ? ["D001", "D002"] : ["D002"];
  if (intent.type === "drug_prescription_duration") return ["E001"];
  if (intent.type === "hospital_scope") return ["H001"];
  if (intent.type === "enrollment") return ["P001", "P002"];
  if (intent.type === "exclusion") return ["E001"];
  return [];
}

function answerJobForIntent(intent) {
  const jobs = {
    coverage_explanation: "画出保障地图，说明责任、保额、免赔额、关键限制。",
    version_comparison: "解释三版入口和住院理赔前置条件差异。",
    hospital_self_pay: "判断住院自费责任，必要时给出透明估算公式和待确认项。",
    domestic_drug: "区分药品目录命中与真实可赔条件，列出适应症、处方、渠道、医保和援助检查项。",
    drug_prescription_duration: "说明超过一个月处方部分的责任限制。",
    hospital_scope: "说明不同责任对应的医院、药店或治疗机构范围。",
    enrollment: "说明投保入口、人群资格、版本选择和必要确认项。",
    materials: "按责任类型列理赔材料；缺少责任类型时提示补充。",
    claim_process: "说明申请路径和下一步材料，而不是直接给理赔承诺。",
    exclusion: "指出可能不承担给付责任的条件，并说明依据。",
  };
  return jobs[intent.type] || "回答该保险问题并输出对应卡片。";
}

function supportingCardsForIntent(intent, route, slots, primaryCard) {
  if (route.policy.status !== "confirmed") {
    return [versionCompareCard()];
  }

  const anchors = sourceAnchorsForIntent(intent, route, slots);
  const cards = [];

  if (intent.type === "coverage_explanation") {
    cards.push(versionCompareCard());
  }
  if (intent.type === "version_comparison") {
    cards.push(evidenceCard("版本差异依据", anchors));
  }
  if (intent.type === "hospital_self_pay") {
    cards.push(evidenceCard("住院赔付依据", anchors));
    if (primaryCard?.missing_info?.length) cards.push(nextStepCard(primaryCard.missing_info));
  }
  if (intent.type === "domestic_drug") {
    cards.push(drugCheckCard(route.policy, slots));
    cards.push(evidenceCard("药品判断依据", anchors));
    if (primaryCard?.missing_info?.length) cards.push(nextStepCard(primaryCard.missing_info));
  }
  if (intent.type === "drug_prescription_duration") {
    cards.push(exclusionCard("处方时长限制", anchors, "超过一个月以上部分不承担给付责任。"));
  }
  if (intent.type === "hospital_scope") {
    cards.push(evidenceCard("医院/渠道依据", anchors));
  }

  return cards;
}

function buildCardPlan(route, slots, ruleResults) {
  const sections = route.intents.map((intent, index) => {
    const primaryCard = ruleResults.cards[index]?.card || null;
    const anchors = sourceAnchorsForIntent(intent, route, slots);
    return {
      intent,
      answer_job: answerJobForIntent(intent),
      primary_card: primaryCard,
      supporting_cards: supportingCardsForIntent(intent, route, slots, primaryCard),
      source_anchors: anchors,
    };
  });

  return {
    strategy: "intent-first-card-stack",
    rule: "每个 intent 输出相邻的正文和 JSON；supporting_cards 只在需要解释依据、差异或下一步时使用。",
    sections,
  };
}

module.exports = {
  buildCardPlan,
};
