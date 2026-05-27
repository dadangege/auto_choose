const EVIDENCE_BANK = {
  P001: {
    id: "P001",
    source: "wiki/policy.md + wiki/enrollment.md",
    clause: "三版产品入口与适用人群",
    supports: ["versioncomparecard", "enrollmentcard", "policyselectcard"],
    exact_fact: "普通版、关爱版、新市民版入口人群不同。",
    applies_to: ["policy.version", "versioncomparecard.versions"],
    verified: "local_wiki",
    verification_note: "已在本地 wiki 中固化；上线前可继续绑定 raw 条款页码。",
  },
  P002: {
    id: "P002",
    source: "wiki/policy.md",
    clause: "产品版本选择规则",
    supports: ["policyselectcard", "versioncomparecard"],
    exact_fact: "用户只说“沪惠保”时，不能默认成普通版，需要先确认版本。",
    applies_to: ["policy.status", "policyselectcard.options"],
    verified: "local_wiki",
    verification_note: "用于防止泛称产品时误判版本。",
  },
  C001: {
    id: "C001",
    source: "wiki/coverage.md",
    clause: "保障责任概览",
    supports: ["coveragecard"],
    exact_fact: "主要责任包括住院自费、国内特药、质子重离子、海外特殊药品、CAR-T。",
    applies_to: ["coveragecard.coverage.summary", "coveragecard.coverage.key_limits"],
    verified: "local_wiki",
    verification_note: "用于回答“保障责任都有什么”。",
  },
  C002: {
    id: "C002",
    source: "wiki/coverage.md",
    clause: "责任保额概览",
    supports: ["coveragecard"],
    exact_fact: "住院及国内特药保额100万；质子重离子30万；海外特殊药品30万；CAR-T 50万。",
    applies_to: ["coveragecard.coverage.insured_amount"],
    verified: "local_wiki",
    verification_note: "保额展示用，最终仍应以 raw 条款为准。",
  },
  R001: {
    id: "R001",
    source: "wiki/claim.md",
    clause: "住院责任免赔额与估算公式",
    supports: ["claimcard"],
    exact_fact: "住院责任基础免赔额按12000元估算，连续投保无理赔可能降低。",
    applies_to: ["claimcard.estimated_payment.deductible", "claimcard.estimated_payment.calculation_note"],
    verified: "local_wiki",
    verification_note: "未知连续投保状态时按基础免赔额估算，并提示需确认。",
  },
  R002: {
    id: "R002",
    source: "wiki/claim.md",
    clause: "新市民版未经当地医保结算赔付比例",
    supports: ["claimcard"],
    exact_fact: "新市民版未走当地医保时，非既往症20%，既往症10%。",
    applies_to: ["claimcard.estimated_payment.pay_ratio", "claimcard.conditions"],
    verified: "local_wiki",
    verification_note: "用于新市民版住院未走当地医保的赔付估算。",
  },
  D001: {
    id: "D001",
    source: "wiki/drug.md",
    clause: "国内特定高额药品目录片段",
    supports: ["drugcheckcard", "claimcard"],
    exact_fact: "泰瑞沙/甲磺酸奥希替尼片在三版国内特定高额药品目录中。",
    applies_to: ["drugcheckcard.directory_status", "claimcard.conditions"],
    verified: "local_wiki",
    verification_note: "目录命中只代表进入后续理赔条件核验，不等于一定能赔。",
  },
  D002: {
    id: "D002",
    source: "wiki/drug.md + wiki/exclusion.md",
    clause: "特药理赔限制条件",
    supports: ["drugcheckcard", "claimcard", "nextstepcard"],
    exact_fact: "奥希替尼仍需核适应病种、适应症、处方医生、购药渠道、医保报销、慈善援助和耐药。",
    applies_to: ["drugcheckcard.checks", "claimcard.missing_info", "nextstepcard.items"],
    verified: "local_wiki",
    verification_note: "用于避免把“目录内”误说成“必赔”。",
  },
  H001: {
    id: "H001",
    source: "wiki/hospital.md",
    clause: "医院、药店与治疗机构范围",
    supports: ["hospitalcard", "drugcheckcard"],
    exact_fact: "不同责任对应不同医院、药店或治疗机构范围。",
    applies_to: ["hospitalcard.scopes", "coveragecard.coverage.hospital_scope"],
    verified: "local_wiki",
    verification_note: "用于医院范围、购药渠道和治疗机构范围说明。",
  },
  E001: {
    id: "E001",
    source: "wiki/drug.md + wiki/exclusion.md",
    clause: "特药处方时长限制",
    supports: ["exclusioncard", "drugcheckcard"],
    exact_fact: "国内特定高额药品和海外特殊药品，每次处方超过一个月以上部分不承担给付责任。",
    applies_to: ["exclusioncard.exclusions", "drugcheckcard.checks"],
    verified: "local_wiki",
    verification_note: "用于处方超过一个月时的限制判断。",
  },
};

function getEvidence(id) {
  return EVIDENCE_BANK[id] || {
    id,
    source: "待绑定来源",
    clause: "待补充",
    supports: [],
    exact_fact: "待补充来源事实。",
    applies_to: [],
    verified: "pending",
    verification_note: "该锚点尚未绑定到本地依据库。",
  };
}

function getEvidenceFact(id) {
  return getEvidence(id).exact_fact;
}

function collectCardAnchors(card, target) {
  if (!card || typeof card !== "object") return;
  if (Array.isArray(card.source_anchors)) {
    card.source_anchors.forEach(id => target.add(id));
  }
  if (Array.isArray(card.anchors)) {
    card.anchors.forEach(anchor => {
      if (typeof anchor === "string") target.add(anchor);
      if (anchor && typeof anchor === "object" && anchor.id) target.add(anchor.id);
    });
  }
}

function uniqueEvidence(ids) {
  return [...ids].filter(Boolean).map(getEvidence);
}

function buildEvidenceView(orchestration, extraCards = []) {
  const allIds = new Set();
  const sections = (orchestration.cardPlan?.sections || []).map(section => {
    const sectionIds = new Set(section.source_anchors || []);
    collectCardAnchors(section.primary_card, sectionIds);
    (section.supporting_cards || []).forEach(card => collectCardAnchors(card, sectionIds));
    sectionIds.forEach(id => allIds.add(id));
    return {
      intent: section.intent,
      answer_job: section.answer_job,
      primary_card_type: section.primary_card?.type || null,
      supporting_card_types: (section.supporting_cards || []).map(card => card.type || card),
      anchors: uniqueEvidence(sectionIds),
    };
  });

  extraCards.forEach(card => collectCardAnchors(card, allIds));

  return {
    query: orchestration.query,
    policy: orchestration.policy,
    summary: {
      anchor_count: allIds.size,
      section_count: sections.length,
      source_mode: "local_wiki",
      note: "当前依据来自本地 wiki 与规则锚点；后续可以继续绑定 raw 保单页码和原文摘录。",
    },
    sections,
    anchors: uniqueEvidence(allIds),
  };
}

module.exports = {
  EVIDENCE_BANK,
  buildEvidenceView,
  getEvidence,
  getEvidenceFact,
};
