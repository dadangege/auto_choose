const POLICY_OPTIONS = [
  {
    policy_name: "2025版沪惠保",
    policy_version: "普通版",
    description: "适用于参加上海市基本医疗保险的在保人员",
  },
  {
    policy_name: "2025版沪惠保",
    policy_version: "关爱版",
    description: "适用于参加上海市市民社区医疗互助帮困计划的人员",
  },
  {
    policy_name: "2025版沪惠保",
    policy_version: "新市民版",
    description: "适用于在上海部分大型企业工作并参加当地基本医保的务工人员",
  },
];

function policySelectCard(policy, intent) {
  return {
    type: "policyselectcard",
    title: "请选择保险产品版本",
    reason: policy.reason || "该问题需要先确认具体产品版本。",
    intent,
    options: POLICY_OPTIONS,
  };
}

function coverageCard(version) {
  return {
    type: "coveragecard",
    coverage: {
      name: version ? `2025版沪惠保${version}保障责任概览` : "2025版沪惠保保障责任概览",
      summary: "主要包括特定住院自费医疗费用、国内特定高额药品、质子重离子、海外特殊药品和CAR-T治疗药品五项责任。",
      insured_amount: "住院及国内特药100万；质子重离子30万；海外特殊药品30万；CAR-T 50万",
      deductible: "住院责任有年度免赔额，其他四项通常0免赔",
      pay_ratio: "需结合责任、版本、是否医保结算和既往症状态判断",
      hospital_scope: "按各责任约定的医院或药店范围执行",
      key_limits: ["三版住院理赔前置条件不同", "药品责任需符合目录、适应症、处方和购药渠道"],
    },
  };
}

function hospitalCard() {
  return {
    type: "hospitalcard",
    title: "医院和药店范围",
    scopes: [
      { name: "住院责任", description: "通常要求二级及以上医保定点医院普通住院部。" },
      { name: "国内特药", description: "上海市二级及以上医院门诊或上海市具备销售药品资质的药店。" },
      { name: "质子重离子", description: "上海市具备质子、重离子治疗资质的医疗机构。" },
      { name: "海外特殊药品", description: "海南博鳌乐城国际医疗旅游先行区内指定医疗机构。" },
    ],
    notes: ["具体范围需结合责任和版本确认"],
  };
}

function enrollmentCard() {
  return {
    type: "enrollmentcard",
    title: "投保相关",
    eligible_groups: [
      "普通版：上海基本医保参保人员",
      "关爱版：上海市市民社区医疗互助帮困计划参加人员",
      "新市民版：上海部分大型企业工作且参加当地医保的务工人员",
    ],
    requirements: ["需确认具体版本和用户身份"],
    notes: ["三版投保人群不同，不能默认普通版"],
  };
}

function drugCard(policy, slots) {
  const hasOsimertinib = slots.drug_name === "甲磺酸奥希替尼片";
  return {
    type: "claimcard",
    claim_scene: {
      claim_type: "国内特定高额药品费用理赔",
      coverage_name: "国内特定高额药品费用保险金",
      support_status: "待确认",
      confidence: hasOsimertinib ? "中" : "低",
      reason: hasOsimertinib
        ? "泰瑞沙/甲磺酸奥希替尼片在三版国内特定高额药品目录中，但是否能赔还取决于适应症、处方医生、购药渠道和医保报销等条件。"
        : "需要先确认药品是否在对应版本的国内特定高额药品目录内。",
    },
    conditions: [
      ...(policy.version ? [{
        name: "产品版本",
        status: "已满足",
        description: `按2025版沪惠保${policy.version}判断。`,
      }] : []),
      ...(hasOsimertinib ? [{
        name: "药品目录",
        status: "已满足",
        description: "泰瑞沙/甲磺酸奥希替尼片在三版国内特定高额药品目录中。",
      }] : []),
    ],
    missing_info: hasOsimertinib
      ? ["是否符合目录约定的肺癌适应病种和适应症", "是否由指定专科医生开具处方", "是否在约定医院门诊或合规药店购买", "是否已获医保报销", "是否涉及慈善援助或耐药"]
      : ["药品名称", "药品目录", "适应症", "处方医生", "购药渠道"],
    notes: [],
  };
}

function prescriptionDurationCard() {
  return {
    type: "claimcard",
    claim_scene: {
      claim_type: "特定高额药品费用理赔",
      coverage_name: "国内特定高额药品费用保险金/海外特殊药品费用保险金",
      support_status: "不支持",
      confidence: "高",
      reason: "每次药品处方超过一个月以上部分的药品费用属于责任免除范围。",
    },
    conditions: [
      {
        name: "处方时长",
        status: "未满足",
        description: "用户描述一次开具两个月处方，超过一个月以上部分不支持。",
      },
    ],
    missing_info: [],
    notes: [],
  };
}

function hospitalClaimCard(policy, slots) {
  const card = {
    type: "claimcard",
    claim_scene: {
      claim_type: "住院自费医疗费用理赔",
      coverage_name: "特定住院自费医疗费用保险金",
      support_status: "待确认",
      confidence: "中",
      reason: "",
    },
    conditions: [],
    missing_info: [],
    notes: [],
  };

  if (policy.version === "新市民版") {
    if (slots.local_medical_insurance_settled === false) {
      const ratio = slots.is_pre_existing ? "10%" : "20%";
      card.claim_scene.support_status = "支持";
      card.claim_scene.reason = "新市民版未经当地医保结算仍可申请，但赔付比例降低。";
      card.conditions.push({
        name: "当地医保结算",
        status: "未满足",
        description: `适用降低后的赔付比例：${ratio}。`,
      });
      if (slots.claim_amount != null && slots.is_pre_existing !== null) {
        const deductible = 12000;
        const numericRatio = slots.is_pre_existing ? 0.1 : 0.2;
        const estimated = Math.max(0, slots.claim_amount - deductible) * numericRatio;
        card.estimated_payment = {
          claim_amount: slots.claim_amount,
          deductible,
          pay_ratio: ratio,
          estimated_result: Math.round(estimated),
          calculation_note: `按基础免赔额12000元估算：(${slots.claim_amount}-12000)×${ratio}=${Math.round(estimated)}元。`,
        };
      }
    } else {
      card.claim_scene.reason = "需确认是否已经经当地基本医保结算。";
      card.missing_info.push("是否已经经当地基本医疗保险结算");
    }
  } else if (policy.version === "关爱版") {
    card.claim_scene.reason = "关爱版住院责任需先获得上海市市民社区医疗互助帮困计划医疗费用补助。";
    if (slots.mutual_aid_subsidy_obtained === false) {
      card.conditions.push({
        name: "互助帮困补助",
        status: "未满足",
        description: "用户描述尚未获得互助帮困计划医疗费用补助。",
      });
    } else {
      card.missing_info.push("是否已获得上海市市民社区医疗互助帮困计划医疗费用补助");
    }
  } else if (policy.version === "普通版") {
    card.claim_scene.reason = "普通版住院责任需经上海基本医疗保险结算后方可申请。";
    if (slots.shanghai_medical_insurance_settled === false) {
      card.conditions.push({
        name: "上海医保结算",
        status: "未满足",
        description: "未用上海医保卡实时结算时，需经上海基本医疗保险结算后方可申请。",
      });
    } else {
      card.missing_info.push("是否已经经上海基本医疗保险结算");
    }
  }

  if (slots.is_pre_existing === null) card.missing_info.push("是否属于既往症人群");
  card.missing_info.push("住院医院是否符合条款要求", "费用是否属于特定住院自费医疗费用");
  return card;
}

function materialCard() {
  return {
    type: "materialcard",
    claim_type: "理赔材料",
    materials: [],
    missing_info: ["具体理赔责任类型"],
  };
}

function claimProcessCard() {
  return {
    type: "materialcard",
    claim_type: "理赔流程",
    materials: [],
    missing_info: ["具体理赔责任类型", "费用明细和就医/购药场景"],
  };
}

function evaluateIntent(query, route, slots, intent) {
  if (route.policy.status !== "confirmed") return policySelectCard(route.policy, intent);
  if (intent.type === "coverage_explanation") return coverageCard(route.policy.version);
  if (intent.type === "hospital_scope") return hospitalCard();
  if (intent.type === "enrollment") return enrollmentCard();
  if (intent.type === "domestic_drug") return drugCard(route.policy, slots);
  if (intent.type === "drug_prescription_duration") return prescriptionDurationCard();
  if (intent.type === "hospital_self_pay") return hospitalClaimCard(route.policy, slots);
  if (intent.type === "materials") return materialCard();
  if (intent.type === "claim_process") return claimProcessCard();
  return coverageCard(route.policy.version);
}

function evaluateRules(query, route, slots) {
  return {
    cards: route.intents.map(intent => ({
      intent,
      card: evaluateIntent(query, route, slots, intent),
    })),
  };
}

module.exports = {
  evaluateRules,
};

