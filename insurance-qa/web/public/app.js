const form = document.querySelector("#testForm");
const baseUrlInput = document.querySelector("#baseUrl");
const modelInput = document.querySelector("#model");
const apiKeyInput = document.querySelector("#apiKey");
const queryInput = document.querySelector("#query");
const runButton = document.querySelector("#runButton");
const previewButton = document.querySelector("#previewButton");
const demoButton = document.querySelector("#demoButton");
const readoutButton = document.querySelector("#readoutButton");
const answerBox = document.querySelector("#answerBox");
const readerBox = document.querySelector("#readerBox");
const outputTitle = document.querySelector("#outputTitle");
const errorPanel = document.querySelector("#errorPanel");
const errorBox = document.querySelector("#errorBox");
const cardList = document.querySelector("#cardList");
const cardCount = document.querySelector("#cardCount");
const metaRow = document.querySelector("#metaRow");
const flowGrid = document.querySelector("#flowGrid");
const copyButton = document.querySelector("#copyButton");
const promptInfo = document.querySelector("#promptInfo");
const statMode = document.querySelector("#statMode");
const statPrompt = document.querySelector("#statPrompt");
const statFirst = document.querySelector("#statFirst");
const statStageOne = document.querySelector("#statStageOne");
const statStageTwo = document.querySelector("#statStageTwo");
const statTotal = document.querySelector("#statTotal");
const statOutput = document.querySelector("#statOutput");
const planList = document.querySelector("#planList");
const planCount = document.querySelector("#planCount");
const stageSplit = document.querySelector("#stageSplit");
const plannerBox = document.querySelector("#plannerBox");
const rendererBox = document.querySelector("#rendererBox");
const stageOneTime = document.querySelector("#stageOneTime");
const stageTwoTime = document.querySelector("#stageTwoTime");

const flowLabels = {
  hospital_self_pay: "住院自费",
  domestic_drug: "国内特药",
  drug_prescription_duration: "处方时长",
  materials: "理赔材料",
  coverage_explanation: "保障责任",
  version_comparison: "版本对比",
  hospital_scope: "医院范围",
  enrollment: "投保相关",
  claim_process: "理赔流程",
  exclusion: "免责限制",
};

const cardTypeLabels = {
  claimcard: "理赔判断卡",
  coveragecard: "保障内容卡",
  policyselectcard: "产品选择卡",
  materialcard: "材料/流程卡",
  hospitalcard: "医院范围卡",
  enrollmentcard: "投保信息卡",
  versioncomparecard: "版本对比卡",
  drugcheckcard: "药品核验卡",
  evidencecard: "证据链卡",
  nextstepcard: "下一步卡",
  exclusioncard: "免责限制卡",
};

document.querySelectorAll("[data-case]").forEach(button => {
  button.addEventListener("click", () => {
    queryInput.value = button.dataset.case;
    runRoutePreview();
  });
});

copyButton.addEventListener("click", async () => {
  const splitText = !stageSplit.hidden
    ? `【第一段回答编排草稿】\n${plannerBox.textContent || ""}\n\n【第二段最终输出】\n${rendererBox.textContent || ""}`.trim()
    : "";
  await navigator.clipboard.writeText(splitText || answerBox.textContent || "");
  copyButton.textContent = "已复制";
  setTimeout(() => {
    copyButton.textContent = "复制";
  }, 1200);
});

previewButton.addEventListener("click", runRoutePreview);
demoButton.addEventListener("click", renderDemoCards);
readoutButton.addEventListener("click", renderProductReadout);

document.querySelectorAll("input[name='promptMode']").forEach(input => {
  input.addEventListener("change", runRoutePreview);
});

form.addEventListener("submit", async event => {
  event.preventDefault();
  await runRealTest();
});

function currentPromptMode() {
  return document.querySelector("input[name='promptMode']:checked")?.value || "wiki";
}

function setLoading(isLoading) {
  document.body.classList.toggle("loading", isLoading);
  runButton.textContent = isLoading ? "流式请求中..." : "运行真实测试";
}

function resetStats() {
  statMode.textContent = "-";
  statPrompt.textContent = "-";
  statFirst.textContent = "-";
  statStageOne.textContent = "-";
  statStageTwo.textContent = "-";
  statTotal.textContent = "-";
  statOutput.textContent = "-";
}

function formatMs(ms) {
  if (ms === null || ms === undefined) return "-";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function updateStats({ promptProfile, firstDeltaMs, stageOneMs, stageTwoMs, totalMs, outputChars } = {}) {
  if (promptProfile) {
    statMode.textContent = promptProfile.label || promptProfile.mode || "-";
    statPrompt.textContent = promptProfile.charCount ? `${promptProfile.charCount} 字符` : "-";
  }
  if (firstDeltaMs !== undefined) statFirst.textContent = formatMs(firstDeltaMs);
  if (stageOneMs !== undefined) statStageOne.textContent = formatMs(stageOneMs);
  if (stageTwoMs !== undefined) statStageTwo.textContent = formatMs(stageTwoMs);
  if (totalMs !== undefined) statTotal.textContent = formatMs(totalMs);
  if (outputChars !== undefined) statOutput.textContent = `${outputChars} 字符`;
}

function showError(message, detail) {
  errorPanel.hidden = false;
  errorBox.textContent = detail ? `${message}\n\n${detail}` : message;
}

function clearError() {
  errorPanel.hidden = true;
  errorBox.textContent = "";
}

function showPlainOutput(text) {
  stageSplit.hidden = true;
  readerBox.hidden = true;
  answerBox.hidden = false;
  outputTitle.textContent = "LLM 原文";
  answerBox.textContent = text;
}

function showReaderOutput() {
  stageSplit.hidden = true;
  answerBox.hidden = true;
  readerBox.hidden = false;
  outputTitle.textContent = "产品解读";
}

function showStageOutput() {
  stageSplit.hidden = false;
  readerBox.hidden = true;
  answerBox.hidden = true;
  outputTitle.textContent = "两段式输出";
}

function resetStageOutput() {
  plannerBox.textContent = "等待第一段输出。";
  rendererBox.textContent = "等待第二段输出。";
  stageOneTime.textContent = "-";
  stageTwoTime.textContent = "-";
}

function extractJsonBlocks(markdown) {
  const blocks = [];
  const pattern = /```json\s*([\s\S]*?)```/g;
  let match;
  while ((match = pattern.exec(markdown)) !== null) {
    const raw = match[1].trim();
    try {
      blocks.push({ ok: true, data: JSON.parse(raw), raw });
    } catch (error) {
      blocks.push({ ok: false, error: error.message, raw });
    }
  }
  return blocks;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function statusClass(status) {
  if (status === "支持" || status === "已满足") return "good";
  if (status === "不支持" || status === "未满足") return "bad";
  return "pending";
}

function addRawJson(parent, data) {
  const details = el("details", "raw-json");
  const summary = el("summary", "", "查看原始 JSON");
  const pre = el("pre", "", JSON.stringify(data, null, 2));
  details.append(summary, pre);
  parent.append(details);
}

function renderKeyValueGrid(items) {
  const grid = el("div", "kv-grid");
  items
    .filter(item => item.value !== undefined && item.value !== null && item.value !== "")
    .forEach(item => {
      const box = el("div", "kv-item");
      box.append(el("span", "", item.label), el("strong", "", item.value));
      grid.append(box);
    });
  return grid;
}

function renderList(items, className = "chip-list") {
  const list = el("div", className);
  (items || []).forEach(item => {
    const chip = el("span", "", typeof item === "string" ? item : JSON.stringify(item));
    list.append(chip);
  });
  return list;
}

function renderClaimCard(data) {
  const scene = data.claim_scene || {};
  const card = el("article", "business-card claim-card");
  const header = el("div", "business-card-header");
  const titleWrap = el("div");
  titleWrap.append(el("span", "card-type", "理赔判断"), el("h4", "", scene.claim_type || "理赔判断"));
  header.append(titleWrap, el("span", `status-pill ${statusClass(scene.support_status)}`, scene.support_status || "待确认"));
  card.append(header);

  if (scene.coverage_name) card.append(el("p", "card-subtitle", scene.coverage_name));
  if (scene.reason) card.append(el("p", "card-reason", scene.reason));

  if (data.estimated_payment) {
    const estimate = data.estimated_payment;
    card.append(renderKeyValueGrid([
      { label: "申请金额", value: estimate.claim_amount != null ? `${estimate.claim_amount} 元` : null },
      { label: "免赔额", value: estimate.deductible != null ? `${estimate.deductible} 元` : null },
      { label: "赔付比例", value: estimate.pay_ratio },
      { label: "预估赔付", value: estimate.estimated_result != null ? `${estimate.estimated_result} 元` : null },
    ]));
    if (estimate.calculation_note) card.append(el("p", "fine-print", estimate.calculation_note));
  }

  if (Array.isArray(data.conditions) && data.conditions.length) {
    const conditionList = el("div", "condition-list");
    data.conditions.forEach(condition => {
      const row = el("div", "condition-row");
      const text = el("div");
      text.append(el("strong", "", condition.name || "条件"), el("p", "", condition.description || ""));
      row.append(text, el("span", `mini-status ${statusClass(condition.status)}`, condition.status || "待确认"));
      conditionList.append(row);
    });
    card.append(conditionList);
  }

  if (Array.isArray(data.missing_info) && data.missing_info.length) {
    card.append(el("p", "section-label", "仍需确认"));
    card.append(renderList(data.missing_info));
  }

  addRawJson(card, data);
  return card;
}

function renderCoverageCard(data) {
  const coverage = data.coverage || {};
  const card = el("article", "business-card coverage-card");
  const header = el("div", "business-card-header");
  const titleWrap = el("div");
  titleWrap.append(el("span", "card-type", "保障内容"), el("h4", "", coverage.name || "保障责任"));
  header.append(titleWrap);
  card.append(header);
  if (coverage.summary) card.append(el("p", "card-reason", coverage.summary));
  card.append(renderKeyValueGrid([
    { label: "保额", value: coverage.insured_amount },
    { label: "免赔额", value: coverage.deductible },
    { label: "赔付比例", value: coverage.pay_ratio },
    { label: "医院/渠道", value: coverage.hospital_scope },
  ]));
  if (Array.isArray(coverage.key_limits) && coverage.key_limits.length) {
    card.append(el("p", "section-label", "关键限制"));
    card.append(renderList(coverage.key_limits));
  }
  addRawJson(card, data);
  return card;
}

function renderPolicySelectCard(data) {
  const card = el("article", "business-card policy-card");
  const header = el("div", "business-card-header");
  const titleWrap = el("div");
  titleWrap.append(el("span", "card-type", "产品选择"), el("h4", "", data.title || "请选择保险产品版本"));
  header.append(titleWrap, el("span", "status-pill pending", "需选择"));
  card.append(header);
  if (data.reason) card.append(el("p", "card-reason", data.reason));
  const options = el("div", "option-list");
  (data.options || []).forEach(option => {
    const item = el("div", "option-row");
    item.append(el("strong", "", `${option.policy_name || ""}${option.policy_version ? ` ${option.policy_version}` : ""}`.trim()), el("p", "", option.description || ""));
    options.append(item);
  });
  card.append(options);
  addRawJson(card, data);
  return card;
}

function renderMaterialCard(data) {
  const card = el("article", "business-card material-card");
  const header = el("div", "business-card-header");
  const titleWrap = el("div");
  titleWrap.append(el("span", "card-type", "材料清单"), el("h4", "", data.claim_type || "理赔材料"));
  header.append(titleWrap);
  card.append(header);
  const materials = data.materials || [];
  if (materials.length) {
    const list = el("div", "option-list");
    materials.forEach(material => {
      const item = el("div", "option-row");
      item.append(el("strong", "", material.name || "材料"), el("p", "", material.description || material.required_level || ""));
      list.append(item);
    });
    card.append(list);
  }
  if (Array.isArray(data.missing_info) && data.missing_info.length) {
    card.append(el("p", "section-label", "仍需确认"));
    card.append(renderList(data.missing_info));
  }
  addRawJson(card, data);
  return card;
}

function renderDomainCard(data, titleFallback, typeLabel) {
  const card = el("article", "business-card coverage-card");
  const header = el("div", "business-card-header");
  const titleWrap = el("div");
  titleWrap.append(el("span", "card-type", typeLabel), el("h4", "", data.title || titleFallback));
  header.append(titleWrap);
  card.append(header);

  if (data.summary) card.append(el("p", "card-reason", data.summary));
  if (Array.isArray(data.scopes) && data.scopes.length) {
    const list = el("div", "option-list");
    data.scopes.forEach(scope => {
      const item = el("div", "option-row");
      item.append(el("strong", "", scope.name || "范围"), el("p", "", scope.description || ""));
      list.append(item);
    });
    card.append(list);
  }
  if (Array.isArray(data.eligible_groups) && data.eligible_groups.length) {
    card.append(el("p", "section-label", "适用人群"));
    card.append(renderList(data.eligible_groups));
  }
  if (Array.isArray(data.requirements) && data.requirements.length) {
    card.append(el("p", "section-label", "要求"));
    card.append(renderList(data.requirements));
  }
  if (Array.isArray(data.notes) && data.notes.length) {
    card.append(el("p", "section-label", "提醒"));
    card.append(renderList(data.notes));
  }
  addRawJson(card, data);
  return card;
}

function renderVersionCompareCard(data) {
  const card = el("article", "business-card version-card");
  const header = el("div", "business-card-header");
  const titleWrap = el("div");
  titleWrap.append(el("span", "card-type", "版本对比"), el("h4", "", data.title || "三版差异"));
  header.append(titleWrap);
  card.append(header);

  const list = el("div", "version-card-grid");
  (data.versions || []).forEach(version => {
    const item = el("div", "version-card-item");
    item.append(
      el("strong", "", version.version || "版本"),
      el("p", "", version.entry || version.eligible_group || version.description || ""),
      el("span", "", version.claim_gate || version.hospital_claim_gate || "")
    );
    list.append(item);
  });
  card.append(list);
  if (Array.isArray(data.notes) && data.notes.length) {
    card.append(el("p", "section-label", "提醒"));
    card.append(renderList(data.notes));
  }
  addRawJson(card, data);
  return card;
}

function renderDrugCheckCard(data) {
  const card = el("article", "business-card drug-card");
  const header = el("div", "business-card-header");
  const titleWrap = el("div");
  titleWrap.append(el("span", "card-type", "药品核验"), el("h4", "", data.title || "药品条件检查"));
  header.append(titleWrap, el("span", "status-pill pending", data.directory_status || "待确认"));
  card.append(header);
  card.append(renderKeyValueGrid([
    { label: "药品", value: data.drug_name },
    { label: "版本", value: data.policy_version },
    { label: "目录状态", value: data.directory_status },
  ]));

  const checks = el("div", "condition-list");
  (data.checks || []).forEach(check => {
    const row = el("div", "condition-row");
    const text = el("div");
    text.append(el("strong", "", check.name || "检查项"), el("p", "", check.description || ""));
    row.append(text, el("span", `mini-status ${statusClass(check.status)}`, check.status || "待确认"));
    checks.append(row);
  });
  card.append(checks);
  if (Array.isArray(data.source_anchors) && data.source_anchors.length) {
    card.append(el("p", "section-label", "证据锚点"));
    card.append(renderList(data.source_anchors));
  }
  addRawJson(card, data);
  return card;
}

function renderEvidenceCard(data) {
  const card = el("article", "business-card evidence-card");
  const header = el("div", "business-card-header");
  const titleWrap = el("div");
  titleWrap.append(el("span", "card-type", "证据链"), el("h4", "", data.title || "依据"));
  header.append(titleWrap);
  card.append(header);
  const list = el("div", "evidence-card-list");
  (data.anchors || []).forEach(anchor => {
    const item = el("div", "evidence-card-item");
    item.append(el("strong", "", anchor.id || "来源"), el("p", "", anchor.fact || anchor.description || ""));
    list.append(item);
  });
  card.append(list);
  addRawJson(card, data);
  return card;
}

function renderNextStepCard(data) {
  const card = el("article", "business-card next-card");
  const header = el("div", "business-card-header");
  const titleWrap = el("div");
  titleWrap.append(el("span", "card-type", "下一步"), el("h4", "", data.title || "还需要确认"));
  header.append(titleWrap);
  card.append(header);
  card.append(renderList(data.items || [], "numbered-chip-list"));
  addRawJson(card, data);
  return card;
}

function renderExclusionCard(data) {
  const card = el("article", "business-card exclusion-card");
  const header = el("div", "business-card-header");
  const titleWrap = el("div");
  titleWrap.append(el("span", "card-type", "免责限制"), el("h4", "", data.title || "责任限制提醒"));
  header.append(titleWrap, el("span", "status-pill pending", "需核验"));
  card.append(header);
  if (data.reason) card.append(el("p", "card-reason", data.reason));
  if (Array.isArray(data.exclusions) && data.exclusions.length) {
    card.append(el("p", "section-label", "可能限制"));
    card.append(renderList(data.exclusions));
  }
  if (Array.isArray(data.source_anchors) && data.source_anchors.length) {
    card.append(el("p", "section-label", "证据锚点"));
    card.append(renderList(data.source_anchors));
  }
  addRawJson(card, data);
  return card;
}

function renderGenericCard(data) {
  const card = el("article", "business-card generic-card");
  const header = el("div", "business-card-header");
  const titleWrap = el("div");
  titleWrap.append(el("span", "card-type", data.type || "JSON"), el("h4", "", data.title || data.type || "卡片"));
  header.append(titleWrap);
  card.append(header);
  addRawJson(card, data);
  return card;
}

function renderVisualCard(data) {
  if (data.type === "claimcard") return renderClaimCard(data);
  if (data.type === "coveragecard") return renderCoverageCard(data);
  if (data.type === "policyselectcard") return renderPolicySelectCard(data);
  if (data.type === "materialcard") return renderMaterialCard(data);
  if (data.type === "hospitalcard") return renderDomainCard(data, "医院/药店范围", "医院范围");
  if (data.type === "enrollmentcard") return renderDomainCard(data, "投保相关", "投保信息");
  if (data.type === "versioncomparecard") return renderVersionCompareCard(data);
  if (data.type === "drugcheckcard") return renderDrugCheckCard(data);
  if (data.type === "evidencecard") return renderEvidenceCard(data);
  if (data.type === "nextstepcard") return renderNextStepCard(data);
  if (data.type === "exclusioncard") return renderExclusionCard(data);
  return renderGenericCard(data);
}

function renderCards(markdown) {
  const blocks = extractJsonBlocks(markdown);
  cardCount.textContent = String(blocks.length);
  cardList.innerHTML = "";

  if (!blocks.length) {
    cardList.className = "card-list empty";
    cardList.textContent = "没有解析到 fenced JSON。";
    return;
  }

  cardList.className = "card-list";
  blocks.forEach((block, index) => {
    if (block.ok) {
      const card = renderVisualCard(block.data);
      card.dataset.cardIndex = String(index + 1);
      cardList.append(card);
    } else {
      const item = el("article", "business-card json-error-card");
      item.append(el("h4", "", `${index + 1}. JSON 解析失败`), el("pre", "", `${block.error}\n\n${block.raw}`));
      cardList.append(item);
    }
  });
}

function renderPlan(routeData, note = "") {
  const sections = routeData?.cardPlan?.sections || [];
  planCount.textContent = String(sections.length);
  planList.innerHTML = "";

  if (!sections.length) {
    planList.className = "plan-list empty";
    planList.textContent = note || "还没有本地编排计划。点「只看路由」或选择测试样例。";
    return;
  }

  planList.className = "plan-list";
  sections.forEach((section, index) => {
    const item = el("article", "plan-item");
    const head = el("div", "plan-item-head");
    const intentName = flowLabels[section.intent?.type] || section.intent?.label || section.intent?.type || "未知意图";
    head.append(el("span", "", String(index + 1)), el("strong", "", intentName));
    item.append(head);

    if (section.answer_job) item.append(el("p", "plan-job", section.answer_job));

    const cards = el("div", "plan-card-row");
    const primaryType = section.primary_card?.type || section.primary_card_ref || "待确认";
    cards.append(el("span", "primary-chip", `主卡：${cardTypeLabels[primaryType] || primaryType}`));
    (section.supporting_cards || []).forEach(card => {
      const type = card.type || card;
      cards.append(el("span", "", cardTypeLabels[type] || type));
    });
    item.append(cards);

    if (Array.isArray(section.source_anchors) && section.source_anchors.length) {
      const anchors = el("div", "anchor-row");
      section.source_anchors.forEach(anchor => anchors.append(el("span", "", anchor)));
      item.append(anchors);
    }

    planList.append(item);
  });
}

function renderDemoCards() {
  const demo = `保障责任部分：新市民版主要包含住院自费、国内特药、质子重离子、海外特殊药品和 CAR-T 治疗药品五项责任。三版责任名称大体一致，但住院理赔前置条件和部分比例不同。

\`\`\`json
{
  "type": "coveragecard",
  "coverage": {
    "name": "2025版沪惠保新市民版保障责任概览",
    "summary": "主要包括特定住院自费医疗费用、国内特定高额药品、质子重离子、海外特殊药品和CAR-T治疗药品五项责任。",
    "insured_amount": "住院及国内特药100万；质子重离子30万；海外特殊药品30万；CAR-T 50万",
    "deductible": "住院责任有年度免赔额，其他四项通常0免赔",
    "pay_ratio": "住院经当地医保结算非既往症70%；未结算非既往症20%",
    "hospital_scope": "按各责任约定的医院或药店范围执行",
    "key_limits": ["新市民版住院未走当地医保时比例降低", "药品责任需符合目录、适应症、处方和购药渠道"]
  }
}
\`\`\`

奥希替尼部分：泰瑞沙/甲磺酸奥希替尼片在三版国内特定高额药品目录中，但还需要确认适应症、处方医生、购药渠道、医保报销和慈善援助情况。

\`\`\`json
{
  "type": "claimcard",
  "claim_scene": {
    "claim_type": "国内特定高额药品费用理赔",
    "coverage_name": "国内特定高额药品费用保险金",
    "support_status": "待确认",
    "confidence": "中",
    "reason": "药品在目录中，但是否能赔还取决于适应症、处方医生、购药渠道和医保报销等条件。"
  },
  "conditions": [
    {
      "name": "药品目录",
      "status": "已满足",
      "description": "泰瑞沙/甲磺酸奥希替尼片在三版国内特定高额药品目录中。"
    },
    {
      "name": "适应症",
      "status": "待确认",
      "description": "需确认是否符合目录约定的肺癌适应病种和适应症限制。"
    }
  ],
  "missing_info": ["疾病诊断和基因突变信息", "处方医生信息", "购药渠道", "是否已获医保报销", "是否涉及慈善援助或耐药"],
  "notes": []
}
\`\`\``;
  clearError();
  showPlainOutput(demo);
  renderCards(demo);
  metaRow.textContent = "卡片样式预览";
  resetStats();
  statMode.textContent = "预览";
  statOutput.textContent = `${demo.length} 字符`;
  renderPlan(null, "卡片预览是静态样例，不经过本地 cardPlan。");
}

function productReadoutMarkdown() {
  return `沪惠保产品解读：2025版沪惠保更像一个“医保之外的补充保障组合”，不是一个单一报销规则。正确的阅读顺序是：先确认产品版本，再拆分保障责任，最后把每个问题转成独立判断卡。

\`\`\`json
{
  "type": "coveragecard",
  "coverage": {
    "name": "2025版沪惠保保障责任总览",
    "summary": "三版主要责任名称大体一致，包括特定住院自费医疗费用、国内特定高额药品、质子重离子、海外特殊药品和CAR-T治疗药品。",
    "insured_amount": "住院及国内特药100万；质子重离子30万；海外特殊药品30万；CAR-T 50万",
    "deductible": "住院责任有年度免赔额；药品类责任通常0免赔",
    "pay_ratio": "按责任、版本、医保结算状态和既往症状态分别判断",
    "hospital_scope": "住院、国内特药、质子重离子、海外药品各有不同医院或药店范围",
    "key_limits": ["不要把泛称“沪惠保”默认成普通版", "住院责任最依赖版本和前置结算条件", "药品在目录中仍需核适应症、处方、渠道和医保报销"]
  }
}
\`\`\`

版本选择：三版最容易混淆的是住院责任前置条件。普通版看上海医保结算，关爱版看互助帮困补助，新市民版看当地医保结算；新市民版未结算也可能申请，但比例会明显降低。

\`\`\`json
{
  "type": "enrollmentcard",
  "title": "三版产品入口",
  "eligible_groups": [
    "普通版：上海基本医保参保人员",
    "关爱版：上海市市民社区医疗互助帮困计划参加人员",
    "新市民版：上海部分大型企业工作且参加当地医保的务工人员"
  ],
  "requirements": ["先确认版本，再判断责任、免赔额和赔付比例"],
  "notes": ["用户只说“沪惠保”时，需要先让用户选择版本"]
}
\`\`\`

医院和渠道：住院、国内特药、质子重离子和海外特殊药品不是同一个就医范围。前端展示时应把“医院/药店范围”单独做成卡片，避免用户把一个责任的医院规则套到另一个责任上。

\`\`\`json
{
  "type": "hospitalcard",
  "title": "医院和购药渠道范围",
  "summary": "不同责任对应不同就医或购药范围，不能混用。",
  "scopes": [
    { "name": "住院责任", "description": "通常要求二级及以上医保定点医院普通住院部。" },
    { "name": "国内特药", "description": "上海市二级及以上医院门诊或具备销售药品资质的上海药店。" },
    { "name": "质子重离子", "description": "上海市具备质子、重离子治疗资质的医疗机构。" },
    { "name": "海外特殊药品", "description": "海南博鳌乐城国际医疗旅游先行区内指定医疗机构。" }
  ],
  "notes": ["具体范围仍需结合产品版本和责任条款确认"]
}
\`\`\`

新市民版住院示例：如果用户说“住院自费3万，没有走当地医保，不是既往症”，可以先给出低风险估算。按基础免赔额12000元和未结算非既往症20%估算，预估赔付为3600元，但仍需确认医院范围和费用是否属于特定住院自费。

\`\`\`json
{
  "type": "claimcard",
  "claim_scene": {
    "claim_type": "新市民版住院自费费用判断",
    "coverage_name": "特定住院自费医疗费用保险金",
    "support_status": "支持",
    "confidence": "中",
    "reason": "新市民版未经当地医保结算仍可申请，但赔付比例降低；非既往症按20%估算。"
  },
  "estimated_payment": {
    "claim_amount": 30000,
    "deductible": 12000,
    "pay_ratio": "20%",
    "estimated_result": 3600,
    "calculation_note": "按基础免赔额12000元估算：(30000-12000)×20%=3600元。"
  },
  "conditions": [
    { "name": "产品版本", "status": "已满足", "description": "按2025版沪惠保新市民版判断。" },
    { "name": "当地医保结算", "status": "未满足", "description": "未结算时适用降低后的赔付比例。" },
    { "name": "既往症", "status": "已满足", "description": "用户描述不是既往症。" }
  ],
  "missing_info": ["住院医院是否符合条款要求", "费用是否属于特定住院自费医疗费用", "是否触发免责情形"],
  "notes": ["该估算不是最终理赔结论"]
}
\`\`\`

奥希替尼示例：泰瑞沙/甲磺酸奥希替尼片在三版国内特定高额药品目录中，但目录命中只代表进入下一步判断。真实理赔还要看疾病诊断、EGFR突变、处方医生、购药渠道、医保报销、慈善援助和耐药情况。

\`\`\`json
{
  "type": "drugcheckcard",
  "title": "奥希替尼报销条件检查",
  "drug_name": "甲磺酸奥希替尼片",
  "directory_status": "目录内",
  "policy_version": "三版均需按各自责任条件判断",
  "checks": [
    { "name": "药品目录", "status": "已满足", "description": "泰瑞沙/甲磺酸奥希替尼片在三版国内特定高额药品目录中。" },
    { "name": "适应病种和适应症", "status": "待确认", "description": "需核对肺癌适应病种、EGFR突变和条款约定适应症。" },
    { "name": "指定专科医生处方", "status": "待确认", "description": "需由条款约定的专科医生开具处方。" },
    { "name": "购药渠道", "status": "待确认", "description": "需在约定医院门诊或合规药店购药。" },
    { "name": "医保报销/慈善援助/耐药", "status": "待确认", "description": "这些因素会影响最终可赔判断。" }
  ],
  "source_anchors": ["D001", "D002"]
}
\`\`\`

\`\`\`json
{
  "type": "evidencecard",
  "title": "奥希替尼判断证据链",
  "anchors": [
    { "id": "D001", "fact": "泰瑞沙/甲磺酸奥希替尼片在三版国内特定高额药品目录中。" },
    { "id": "D002", "fact": "药品目录命中后仍需核适应症、处方医生、购药渠道、医保报销、慈善援助和耐药。" }
  ]
}
\`\`\`

\`\`\`json
{
  "type": "claimcard",
  "claim_scene": {
    "claim_type": "奥希替尼特药费用判断",
    "coverage_name": "国内特定高额药品费用保险金",
    "support_status": "待确认",
    "confidence": "中",
    "reason": "泰瑞沙/甲磺酸奥希替尼片在目录中，但是否能赔取决于适应症、处方、购药渠道和医保报销等条件。"
  },
  "conditions": [
    {
      "name": "药品目录",
      "status": "已满足",
      "description": "泰瑞沙/甲磺酸奥希替尼片在三版国内特定高额药品目录中。"
    },
    {
      "name": "适应症",
      "status": "待确认",
      "description": "需符合目录约定的肺癌适应病种和EGFR突变等限制。"
    }
  ],
  "missing_info": ["疾病诊断", "基因突变信息", "处方医生", "购药渠道", "是否已获医保报销", "是否涉及慈善援助或耐药"],
  "notes": ["药品在目录中不等于一定能赔"]
}
\`\`\``;
}

function renderProductReadout() {
  clearError();
  const markdown = productReadoutMarkdown();
  answerBox.textContent = markdown;
  showReaderOutput();
  readerBox.innerHTML = `
    <article class="reader-article">
      <header class="reader-hero report-hero">
        <div class="reader-hero-copy">
          <p class="reader-kicker">INSURANCE READER</p>
          <h3>2025版沪惠保产品解读报告</h3>
          <p>用“版本入口、保障矩阵、证据链、展示卡片”四层结构，把条款从长文档变成可读、可问、可展示的产品说明。</p>
          <div class="reader-badges" aria-label="生成依据">
            <span>insurance-qa 规则</span>
            <span>nature-writing 结构</span>
            <span>JSON 卡片输出</span>
          </div>
        </div>
        <div class="reader-map" aria-label="保障地图">
          <div class="map-node primary-node">
            <strong>沪惠保</strong>
            <span>2025</span>
          </div>
          <div class="map-ring ring-a">住院自费</div>
          <div class="map-ring ring-b">国内特药</div>
          <div class="map-ring ring-c">质子重离子</div>
          <div class="map-ring ring-d">海外特药</div>
          <div class="map-ring ring-e">CAR-T</div>
        </div>
      </header>

      <section class="reader-section insight-section">
        <div class="section-heading">
          <span class="section-index">01</span>
          <div>
            <h4>先读结论</h4>
            <p>这是面向用户问答的产品摘要，不是完整条款复刻。</p>
          </div>
        </div>
        <div class="insight-grid">
          <div><strong>5项</strong><span>核心保障责任</span></div>
          <div><strong>3版</strong><span>入口人群不同</span></div>
          <div><strong>100万</strong><span>住院及国内特药保额</span></div>
          <div><strong>先版本</strong><span>再判断责任和比例</span></div>
        </div>
      </section>

      <section class="reader-section">
        <div class="section-heading">
          <span class="section-index">02</span>
          <div>
            <h4>保障责任矩阵</h4>
            <p>用户问“保障都有什么”时，先给地图，再按责任进入判断。</p>
          </div>
        </div>
        <div class="benefit-matrix" role="table" aria-label="保障责任矩阵">
          <div role="row" class="matrix-head"><span>责任</span><span>保额</span><span>免赔额</span><span>关键判断</span></div>
          <div role="row"><span>特定住院自费</span><span>100万</span><span>有年度免赔额</span><span>版本、医保/补助结算、既往症</span></div>
          <div role="row"><span>国内特定高额药品</span><span>100万</span><span>通常0免赔</span><span>目录、适应症、处方、购药渠道</span></div>
          <div role="row"><span>质子重离子</span><span>30万</span><span>通常0免赔</span><span>治疗机构和责任范围</span></div>
          <div role="row"><span>海外特殊药品</span><span>30万</span><span>通常0免赔</span><span>博鳌渠道、目录、处方限制</span></div>
          <div role="row"><span>CAR-T治疗药品</span><span>50万</span><span>通常0免赔</span><span>药品、适应症和治疗路径</span></div>
        </div>
      </section>

      <section class="reader-section">
        <div class="section-heading">
          <span class="section-index">03</span>
          <div>
            <h4>三版差异不是装饰信息</h4>
            <p>同一句“住院自费能不能赔”，三版触发条件不同。</p>
          </div>
        </div>
        <div class="version-compare">
          <div>
            <span>普通版</span>
            <strong>上海基本医保参保人员</strong>
            <p>住院责任需经上海基本医疗保险结算后再申请。</p>
          </div>
          <div>
            <span>关爱版</span>
            <strong>互助帮困计划参加人员</strong>
            <p>住院责任看是否先获得互助帮困计划医疗费用补助。</p>
          </div>
          <div>
            <span>新市民版</span>
            <strong>上海部分大型企业务工人员</strong>
            <p>经当地医保结算按较高比例；未结算仍可申请但比例降低。</p>
          </div>
        </div>
      </section>

      <section class="reader-section claim-example">
        <div class="section-heading">
          <span class="section-index">04</span>
          <div>
            <h4>示例判断：新市民版住院自费3万</h4>
            <p>把用户问题拆成可计算和待确认两部分。</p>
          </div>
        </div>
        <div class="calculation-panel">
          <div class="formula">
            <span>符合费用</span>
            <strong>30000</strong>
          </div>
          <div class="operator">-</div>
          <div class="formula">
            <span>基础免赔额</span>
            <strong>12000</strong>
          </div>
          <div class="operator">×</div>
          <div class="formula">
            <span>未结算比例</span>
            <strong>20%</strong>
          </div>
          <div class="operator">=</div>
          <div class="formula result">
            <span>预估赔付</span>
            <strong>3600</strong>
          </div>
        </div>
      </section>

      <section class="reader-section evidence-section">
        <div class="section-heading">
          <span class="section-index">05</span>
          <div>
            <h4>奥希替尼：目录命中只是第一步</h4>
            <p>这里借鉴 nature-reader 的来源锚点和证据链，不把“在目录”误说成“必赔”。</p>
          </div>
        </div>
        <div class="evidence-grid">
          <div>
            <span class="source-anchor">S001</span>
            <strong>药品目录</strong>
            <p>泰瑞沙/甲磺酸奥希替尼片在三版国内特定高额药品目录中。</p>
          </div>
          <div>
            <span class="source-anchor">S002</span>
            <strong>适应症限制</strong>
            <p>需要核对肺癌适应病种、EGFR突变和条款约定适应症。</p>
          </div>
          <div>
            <span class="source-anchor">S003</span>
            <strong>理赔条件</strong>
            <p>还要确认处方医生、购药渠道、医保报销、慈善援助和耐药情况。</p>
          </div>
        </div>
      </section>

      <section class="reader-section reader-callout">
        <div class="section-heading">
          <span class="section-index">06</span>
          <div>
            <h4>产品化输出方式</h4>
            <p>正文回答用户，JSON 驱动卡片。多意图问题保持“内容 + JSON + 内容 + JSON”的顺序，便于前端逐段展示。</p>
          </div>
        </div>
      </section>
    </article>
  `;
  renderCards(markdown);
  metaRow.textContent = "产品解读样例";
  resetStats();
  statMode.textContent = "解读";
  statOutput.textContent = `${markdown.length} 字符`;
  renderPlan(null, "产品解读是静态展示样例，用来看报告 UI 和卡片形态；真实编排请点「只看路由」。");
}

function renderFlow(routePreview, activeLlm = false, latencyMs = null, usage = null, promptProfile = null) {
  const policyText = routePreview?.policy?.status === "confirmed"
    ? `已确认：${routePreview.policy.version}`
    : `需选择：${routePreview?.policy?.reason || "版本不明确"}`;
  const intentText = (routePreview?.intents || [])
    .map(intent => flowLabels[intent.type] || intent.label || intent.type)
    .join("、");

  const promptText = promptProfile?.charCount
    ? `${promptProfile.label || promptProfile.mode} · ${promptProfile.charCount} 字符`
    : "等待模型返回";
  const usageText = usage?.total_tokens ? `Token ${usage.total_tokens}` : promptText;
  const latencyText = latencyMs ? `${latencyMs} ms` : "";

  flowGrid.innerHTML = `
    <article class="flow-step active">
      <span>1</span>
      <strong>产品识别</strong>
      <p>${escapeHtml(policyText)}</p>
    </article>
    <article class="flow-step active">
      <span>2</span>
      <strong>意图拆分</strong>
      <p>${escapeHtml(intentText || "未识别")}</p>
    </article>
    <article class="flow-step ${activeLlm ? "active" : "muted"}">
      <span>3</span>
      <strong>LLM 判断</strong>
      <p>${escapeHtml(activeLlm ? usageText : "还未请求模型")}</p>
    </article>
    <article class="flow-step ${activeLlm ? "active" : "muted"}">
      <span>4</span>
      <strong>卡片渲染</strong>
      <p>${escapeHtml(latencyText || "等待结果")}</p>
    </article>
  `;
}

function updatePromptInfo(routeData, profileOverride = null) {
  const profile = profileOverride || routeData?.promptProfiles?.[currentPromptMode()];
  if (!profile) {
    promptInfo.textContent = "等待计算 prompt 体量。";
    return;
  }
  const snippets = profile.selectedSnippets?.join("、") || "无";
  promptInfo.textContent = `${profile.label || profile.mode}：约 ${profile.charCount} 字符；片段：${snippets}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data.detail ? JSON.stringify(data.detail, null, 2) : "";
    throw new Error(`${data.error || "请求失败"}${detail ? `\n${detail}` : ""}`);
  }
  return data;
}

function parseSseBlock(block) {
  let event = "message";
  const data = [];
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      data.push(line.slice(5).trimStart());
    }
  }
  if (!data.length) return null;
  const text = data.join("\n");
  try {
    return { event, data: JSON.parse(text) };
  } catch {
    return { event, data: text };
  }
}

async function postStream(url, payload, onEvent) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => "");
    throw new Error(text || "流式请求失败。");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() || "";

    for (const block of blocks) {
      const parsed = parseSseBlock(block);
      if (!parsed) continue;
      await onEvent(parsed.event, parsed.data);
      if (parsed.event === "error") {
        const detail = parsed.data?.detail ? `\n${JSON.stringify(parsed.data.detail, null, 2)}` : "";
        throw new Error(`${parsed.data?.error || "流式请求失败。"}${detail}`);
      }
    }
  }

  const tail = decoder.decode();
  if (tail) buffer += tail;
  if (buffer.trim()) {
    const parsed = parseSseBlock(buffer);
    if (parsed) await onEvent(parsed.event, parsed.data);
  }
}

async function runRoutePreview() {
  clearError();
  if (currentPromptMode() === "two_stage") {
    showStageOutput();
    resetStageOutput();
    plannerBox.textContent = "点「运行真实测试」后，这里显示第一段 LLM 的回答编排草稿。";
    rendererBox.textContent = "第二段会按第一段草稿的顺序，用 wiki 和规则补齐最终回答与 JSON。";
  } else {
    showPlainOutput(answerBox.textContent || "还没有结果。");
  }
  try {
    const data = await postJson("/api/route", { query: queryInput.value });
    const profile = data.promptProfiles?.[currentPromptMode()];
    renderFlow(data, false, null, null, profile);
    renderPlan(data);
    updatePromptInfo(data, profile);
    updateStats({ promptProfile: profile });
    metaRow.textContent = profile ? `${profile.label} · ${profile.charCount} 字符` : "本地路由预检";
  } catch (error) {
    showError(error.message);
  }
}

async function runRealTest() {
  clearError();
  setLoading(true);
  resetStats();
  const twoStageMode = currentPromptMode() === "two_stage";
  if (twoStageMode) {
    showStageOutput();
    resetStageOutput();
  } else {
    showPlainOutput("");
  }
  cardList.className = "card-list empty";
  cardList.textContent = "流式输出完成后解析 fenced JSON。";
  cardCount.textContent = "0";

  try {
    const route = await postJson("/api/route", { query: queryInput.value });
    const profile = route.promptProfiles?.[currentPromptMode()];
    renderFlow(route, false, null, null, profile);
    renderPlan(route);
    updatePromptInfo(route, profile);
    updateStats({ promptProfile: profile });

    let content = "";
    let finalData = null;

    await postStream("/api/chat-stream", {
      baseUrl: baseUrlInput.value,
      model: modelInput.value,
      apiKey: apiKeyInput.value,
      query: queryInput.value,
      promptMode: currentPromptMode(),
      temperature: 0.2,
    }, async (event, data) => {
      if (event === "meta") {
        updateStats({ promptProfile: data.promptProfile });
        renderFlow(data.routePreview || route, true, null, null, data.promptProfile);
        renderPlan(data.orchestration || route);
        updatePromptInfo(route, data.promptProfile);
        metaRow.textContent = `${data.promptProfile?.label || currentPromptMode()} · 等待首字`;
      }

      if (event === "stage") {
        if (data.name === "planner_started") {
          showStageOutput();
          plannerBox.textContent = "正在分析回答方向、段落结构和卡片插入位置...";
          rendererBox.textContent = "等待第一段完成后开始。";
          stageOneTime.textContent = "请求中";
          stageTwoTime.textContent = "-";
          metaRow.textContent = "第一段：生成回答编排草稿";
        }
        if (data.name === "planner_done") {
          plannerBox.textContent = data.content || "第一段未返回内容。";
          stageOneTime.textContent = formatMs(data.timings?.stageMs);
          updateStats({
            stageOneMs: data.timings?.stageMs,
            outputChars: data.timings?.outputChars || 0,
          });
          metaRow.textContent = `第一段完成 · ${formatMs(data.timings?.stageMs)}`;
        }
        if (data.name === "renderer_started") {
          updateStats({ promptProfile: data.promptProfile });
          rendererBox.textContent = "正在基于第一段草稿和 wiki 生成最终回答...";
          stageTwoTime.textContent = "请求中";
          metaRow.textContent = "第二段：基于 wiki 补齐最终回答";
        }
      }

      if (event === "timing") {
        if (data.name === "first_delta") {
          const firstMs = twoStageMode ? data.stageMs ?? data.ms : data.ms;
          updateStats({ firstDeltaMs: firstMs });
          if (twoStageMode) stageTwoTime.textContent = `首字 ${formatMs(firstMs)}`;
          metaRow.textContent = `${twoStageMode ? "第二段首字" : "首字"} ${formatMs(firstMs)}`;
        }
      }

      if (event === "delta") {
        content += data.text || "";
        if (twoStageMode) {
          rendererBox.textContent = content;
          rendererBox.scrollTop = rendererBox.scrollHeight;
          answerBox.textContent = content;
        } else {
          answerBox.textContent = content;
          answerBox.scrollTop = answerBox.scrollHeight;
        }
        updateStats({ outputChars: content.length });
      }

      if (event === "done") {
        finalData = data;
        content = data.content || content;
        if (twoStageMode) {
          plannerBox.textContent = data.plannerContent || plannerBox.textContent || "第一段未返回内容。";
          rendererBox.textContent = content || "模型没有返回内容。";
          answerBox.textContent = content || "模型没有返回内容。";
          stageOneTime.textContent = formatMs(data.timings?.plannerMs);
          stageTwoTime.textContent = formatMs(data.timings?.rendererMs ?? data.timings?.upstreamMs);
        } else {
          answerBox.textContent = content || "模型没有返回内容。";
        }
        renderCards(content || "");
        renderFlow(data.routePreview || route, true, data.timings?.totalMs, data.usage, data.promptProfile);
        renderPlan(data.orchestration || route);
        updatePromptInfo(route, data.promptProfile);
        updateStats({
          promptProfile: data.promptProfile,
          firstDeltaMs: twoStageMode
            ? data.timings?.rendererFirstDeltaMs ?? data.timings?.firstDeltaMs
            : data.timings?.firstDeltaMs,
          stageOneMs: data.timings?.plannerMs,
          stageTwoMs: data.timings?.rendererMs ?? data.timings?.upstreamMs,
          totalMs: data.timings?.totalMs,
          outputChars: data.timings?.outputChars ?? content.length,
        });
        const label = data.promptProfile?.label || currentPromptMode();
        const chars = data.promptProfile?.charCount ? ` · ${data.promptProfile.charCount} 字符` : "";
        metaRow.textContent = `${label} · ${data.model || modelInput.value} · ${formatMs(data.timings?.totalMs)}${chars}`;
      }
    });

    if (!finalData && content) {
      renderCards(content);
      updateStats({ outputChars: content.length });
    }
  } catch (error) {
    if (!answerBox.textContent) answerBox.textContent = "请求失败。";
    showError(error.message);
    metaRow.textContent = "请求失败";
  } finally {
    setLoading(false);
  }
}

runRoutePreview();
