function selectPolicy(query) {
  const q = String(query || "");
  const ordinaryMarkers = ["普通版", "上海医保卡", "上海基本医保", "上海市基本医疗保险"];
  const careMarkers = ["关爱版", "互助帮困", "帮困计划", "社区医疗互助"];
  const newCitizenMarkers = [
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
  ];

  if (careMarkers.some(marker => q.includes(marker))) {
    return { status: "confirmed", version: "关爱版", reason: null };
  }
  if (newCitizenMarkers.some(marker => q.includes(marker))) {
    return { status: "confirmed", version: "新市民版", reason: null };
  }
  if (ordinaryMarkers.some(marker => q.includes(marker))) {
    return { status: "confirmed", version: "普通版", reason: null };
  }
  if (/(沪惠保|2025版沪惠保)/.test(q)) {
    return {
      status: "need_select",
      version: null,
      reason: "用户提到沪惠保，但未明确普通版、关爱版或新市民版。",
    };
  }
  return { status: "need_select", version: null, reason: "用户未提供明确产品版本。" };
}

function firstIndex(query, pattern) {
  const index = String(query || "").search(pattern);
  return index >= 0 ? index : Infinity;
}

function splitIntents(query) {
  const q = String(query || "");
  const candidates = [
    {
      type: "hospital_self_pay",
      label: "住院自费部分",
      index: firstIndex(q, /住院|自费|没走医保|未走医保|没走当地医保|未走当地医保|赔多少/),
    },
    {
      type: "hospital_scope",
      label: "医院范围部分",
      index: firstIndex(q, /医院|医院范围|定点医院|普通住院部|药店|购药渠道|哪里买药|哪里治疗/),
    },
    {
      type: /(两个月|2个月|超过一个月)/.test(q) ? "drug_prescription_duration" : "domestic_drug",
      label: /(两个月|2个月|超过一个月)/.test(q) ? "处方时长部分" : "药品报销部分",
      index: firstIndex(q, /药|奥希替尼|泰瑞沙|处方|药店|购药/),
    },
    {
      type: /(材料|资料)/.test(q) ? "materials" : "claim_process",
      label: /(材料|资料)/.test(q) ? "理赔材料部分" : "理赔流程部分",
      index: firstIndex(q, /理赔|报销|赔付|赔多少|材料|资料|申请理赔|怎么申请/),
    },
    {
      type: "enrollment",
      label: "投保相关部分",
      index: firstIndex(q, /投保|参保|能买吗|能不能买|怎么买|投保范围|人群|资格|保费|等待期|保险期间/),
    },
    {
      type: "coverage_explanation",
      label: "保障责任部分",
      index: firstIndex(q, /保障责任|保险责任|责任都有什么|保障都有什么|保什么|保障范围|保额|等待期|除外责任|免责条款/),
    },
  ];

  const seen = new Set();
  const intents = [];
  for (const candidate of candidates.filter(item => item.index !== Infinity).sort((a, b) => a.index - b.index)) {
    if (candidate.type === "hospital_scope" && seen.has("domestic_drug")) continue;
    if (candidate.type === "claim_process" && seen.has("hospital_self_pay")) continue;
    if (!seen.has(candidate.type)) {
      seen.add(candidate.type);
      intents.push({ type: candidate.type, label: candidate.label });
    }
  }

  if (!intents.length) {
    intents.push({ type: "coverage_explanation", label: "保障解释部分" });
  }
  return intents;
}

function routeQuery(query) {
  return {
    policy: selectPolicy(query),
    intents: splitIntents(query),
  };
}

module.exports = {
  routeQuery,
  selectPolicy,
  splitIntents,
};

