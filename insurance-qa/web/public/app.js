const form = document.querySelector("#testForm");
const baseUrlInput = document.querySelector("#baseUrl");
const modelInput = document.querySelector("#model");
const apiKeyInput = document.querySelector("#apiKey");
const queryInput = document.querySelector("#query");
const runButton = document.querySelector("#runButton");
const previewButton = document.querySelector("#previewButton");
const demoButton = document.querySelector("#demoButton");
const answerBox = document.querySelector("#answerBox");
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
const statTotal = document.querySelector("#statTotal");
const statOutput = document.querySelector("#statOutput");

const flowLabels = {
  hospital_self_pay: "住院自费",
  domestic_drug: "国内特药",
  drug_prescription_duration: "处方时长",
  materials: "理赔材料",
  coverage_explanation: "保障责任",
  hospital_scope: "医院范围",
  enrollment: "投保相关",
  claim_process: "理赔流程",
};

document.querySelectorAll("[data-case]").forEach(button => {
  button.addEventListener("click", () => {
    queryInput.value = button.dataset.case;
    runRoutePreview();
  });
});

copyButton.addEventListener("click", async () => {
  await navigator.clipboard.writeText(answerBox.textContent || "");
  copyButton.textContent = "已复制";
  setTimeout(() => {
    copyButton.textContent = "复制";
  }, 1200);
});

previewButton.addEventListener("click", runRoutePreview);
demoButton.addEventListener("click", renderDemoCards);

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
  statTotal.textContent = "-";
  statOutput.textContent = "-";
}

function formatMs(ms) {
  if (ms === null || ms === undefined) return "-";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function updateStats({ promptProfile, firstDeltaMs, totalMs, outputChars } = {}) {
  if (promptProfile) {
    statMode.textContent = promptProfile.label || promptProfile.mode || "-";
    statPrompt.textContent = promptProfile.charCount ? `${promptProfile.charCount} 字符` : "-";
  }
  if (firstDeltaMs !== undefined) statFirst.textContent = formatMs(firstDeltaMs);
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
  answerBox.textContent = demo;
  renderCards(demo);
  metaRow.textContent = "卡片样式预览";
  resetStats();
  statMode.textContent = "预览";
  statOutput.textContent = `${demo.length} 字符`;
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
  try {
    const data = await postJson("/api/route", { query: queryInput.value });
    const profile = data.promptProfiles?.[currentPromptMode()];
    renderFlow(data, false, null, null, profile);
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
  answerBox.textContent = "";
  cardList.className = "card-list empty";
  cardList.textContent = "流式输出完成后解析 fenced JSON。";
  cardCount.textContent = "0";

  try {
    const route = await postJson("/api/route", { query: queryInput.value });
    const profile = route.promptProfiles?.[currentPromptMode()];
    renderFlow(route, false, null, null, profile);
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
        updatePromptInfo(route, data.promptProfile);
        metaRow.textContent = `${data.promptProfile?.label || currentPromptMode()} · 等待首字`;
      }

      if (event === "timing") {
        if (data.name === "first_delta") {
          updateStats({ firstDeltaMs: data.ms });
          metaRow.textContent = `首字 ${formatMs(data.ms)}`;
        }
      }

      if (event === "delta") {
        content += data.text || "";
        answerBox.textContent = content;
        answerBox.scrollTop = answerBox.scrollHeight;
        updateStats({ outputChars: content.length });
      }

      if (event === "done") {
        finalData = data;
        content = data.content || content;
        answerBox.textContent = content || "模型没有返回内容。";
        renderCards(content || "");
        renderFlow(data.routePreview || route, true, data.timings?.totalMs, data.usage, data.promptProfile);
        updatePromptInfo(route, data.promptProfile);
        updateStats({
          promptProfile: data.promptProfile,
          firstDeltaMs: data.timings?.firstDeltaMs,
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
