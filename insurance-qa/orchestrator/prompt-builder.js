const fs = require("fs");
const path = require("path");
const { retrieveWiki } = require("./wiki");

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function buildSystemPrompt(rootDir) {
  const files = [
    ["SKILL.md", path.join(rootDir, "SKILL.md")],
    ["references/policy-select.md", path.join(rootDir, "references", "policy-select.md")],
    ["references/intent-routing.md", path.join(rootDir, "references", "intent-routing.md")],
    ["references/card-taxonomy.md", path.join(rootDir, "references", "card-taxonomy.md")],
    ["references/source-grounding.md", path.join(rootDir, "references", "source-grounding.md")],
    ["references/claim-judge.md", path.join(rootDir, "references", "claim-judge.md")],
    ["references/answer-render.md", path.join(rootDir, "references", "answer-render.md")],
    ["references/answer-composition.md", path.join(rootDir, "references", "answer-composition.md")],
  ];
  const joined = files
    .map(([name, filePath]) => `===== ${name} =====\n${readText(filePath)}`)
    .join("\n\n");

  return `你是保险问答测试助手。严格按照下面的 insurance-qa skill 与 reference 规则回答用户。

要求：
1. 先做产品版本选择。
2. 如果用户一句话包含多个问题，先拆分意图，再分别判断。
3. 不要把多个意图混成一个结论。
4. 如果产品版本不明确且涉及版本差异，必须要求用户选择版本。
5. 最终回答使用中文 Markdown，并在适合时输出 fenced json 卡片。
6. 多意图问题必须按“内容 + json + 内容 + json”的顺序输出：每个意图先给对应文字解释，紧跟该意图自己的 fenced json，不要先输出整体内容再集中输出所有 JSON。
7. 不要输出你的思考过程。

${joined}`;
}

function orchestrationPayload(orchestration) {
  return {
    route: orchestration.route,
    slots: orchestration.slots,
    ruleResults: orchestration.ruleResults,
    cardPlan: {
      strategy: orchestration.cardPlan.strategy,
      rule: orchestration.cardPlan.rule,
      sections: orchestration.cardPlan.sections.map((section, index) => ({
        intent: section.intent,
        answer_job: section.answer_job,
        primary_card_ref: `ruleResults.cards[${index}].card`,
        supporting_cards: section.supporting_cards,
        source_anchors: section.source_anchors,
      })),
    },
    validation: orchestration.validation,
  };
}

function buildWikiPrompt(rootDir, orchestration) {
  const snippets = retrieveWiki(rootDir, orchestration.route);
  const joined = snippets.map(({ name, text }) => `===== wiki:${name} =====\n${text}`).join("\n\n");
  const prompt = `你是保险问答测试助手。下面不是完整 skill，而是本地编排器命中的 Wiki 片段和规则引擎结果。只能基于这些信息回答。

本地编排结果：
${JSON.stringify(orchestrationPayload(orchestration))}

执行要求：
1. 按 route.intents 顺序回答。
2. 如果 route.policy.status 是 need_select，先要求用户选择版本，不要输出确定理赔结论。
3. 多意图必须按“内容 + json + 内容 + json”顺序输出。
4. 每个意图的文字说明后，紧跟该意图自己的 fenced json。
5. 优先采用 cardPlan.sections 中的 primary_card；supporting_cards 只在有助于解释依据、版本差异、下一步时输出。
6. 对 evidencecard、drugcheckcard、nextstepcard、versioncomparecard 可直接输出 fenced json，前端会渲染。
7. 不要输出思考过程，不要虚构未给出的条款。

${joined}`;

  return {
    prompt,
    snippets,
    profile: {
      mode: "wiki",
      label: "快速 Wiki",
      charCount: prompt.length,
      selectedSnippets: snippets.map(item => item.name),
      routePreview: orchestration.route,
    },
  };
}

function buildFullPrompt(rootDir, orchestration) {
  const prompt = `${buildSystemPrompt(rootDir)}

本地编排结果：
${JSON.stringify(orchestrationPayload(orchestration))}

请按本地编排结果中的 route.intents 顺序输出。多意图时必须保持“内容 + json + 内容 + json”的相邻结构。`;
  return {
    prompt,
    snippets: [],
    profile: {
      mode: "full",
      label: "完整 Skill",
      charCount: prompt.length,
      selectedSnippets: [
        "SKILL.md",
        "policy-select.md",
        "intent-routing.md",
        "card-taxonomy.md",
        "source-grounding.md",
        "claim-judge.md",
        "answer-render.md",
        "answer-composition.md",
      ],
      routePreview: orchestration.route,
    },
  };
}

function buildReportPrompt(rootDir, orchestration) {
  const snippets = retrieveWiki(rootDir, orchestration.route);
  const joined = snippets.map(({ name, text }) => `===== wiki:${name} =====\n${text}`).join("\n\n");
  const prompt = `你是保险产品解读报告助手。事实层必须服从 insurance-qa 本地编排结果；表达层采用 nature-reader / nature-writing 风格：先给读者地图，再给证据链和边界，不把摘要写成散乱问答。

本地编排结果：
${JSON.stringify(orchestrationPayload(orchestration))}

报告输出要求：
1. 用中文输出，标题可以写“2025版沪惠保产品解读”或按用户问题改写。
2. 第一段给直接结论，用 2-4 句说明用户最关心的答案。
3. 随后按“保障地图 / 版本入口 / 责任判断 / 证据链 / 待确认信息”组织内容。
4. 像 nature-reader 一样保留证据锚点，优先使用 cardPlan.sections[].source_anchors 中的 P/C/D/H/R/E 编号；锚点只能对应下方 wiki 或本地编排结果，不要虚构来源。
5. 像 nature-writing 一样保持 claim-evidence 边界：每个结论都要说明依据和限制。
6. 如果 route.policy.status 是 need_select，必须先让用户选择版本，不要输出确定赔付结论。
7. 多意图问题必须保持“内容 + json + 内容 + json”的相邻顺序。
8. 每个主要段落后紧跟对应 fenced json 卡片，优先使用 cardPlan.sections 中的 primary_card；必要时输出 supporting_cards。
9. 对 evidencecard、drugcheckcard、nextstepcard、versioncomparecard 可直接输出 fenced json，前端会渲染。
10. 不要输出思考过程，不要虚构未提供的条款、金额、比例或医疗事实。

${joined}`;

  return {
    prompt,
    snippets,
    profile: {
      mode: "report",
      label: "解读报告",
      charCount: prompt.length,
      selectedSnippets: snippets.map(item => item.name),
      routePreview: orchestration.route,
    },
  };
}

function buildPlannerPrompt(rootDir, orchestration) {
  const domainNames = ["coverage", "drug", "hospital", "enrollment", "claim", "policy", "exclusion"];
  const availableDomains = [
    "coverage: 保障责任、保额、免赔额、赔付比例、责任边界",
    "drug: 国内特药、海外药、CAR-T、目录、适应症、处方和购药限制",
    "hospital: 医院范围、药店范围、治疗机构、购药渠道",
    "enrollment: 投保资格、版本入口、保费、等待期、保障期间",
    "claim: 理赔判断、估算、材料、流程、下一步",
    "policy: 普通版、关爱版、新市民版的选择和差异",
    "exclusion: 免责、除外责任、耐药、慈善援助、非保障情形",
  ].map(item => `- ${item}`).join("\n");
  const prompt = `你是保险问答的第一段 Answer Architect。你的任务不是回答用户，也不是补齐事实，而是根据用户问题设计最终回答的方向、结构和展示节奏。

你只需要知道可用的展示组件，并按问题需要自由编排。不要被固定 intent 或固定顺序束缚；如果用户一句话里有多个问题，你可以自行决定拆成几个回答段、每段后面插什么卡片。

可用展示组件：
- summary_block：开头直接结论，适合先说用户最关心的答案。
- text_block：普通解释文字，适合承接上下文、解释边界、提示风险。
- clarification_block：需要用户补充版本、材料、医院、适应症等信息时使用。
- coveragecard：保障责任、保额、免赔额、核心限制。
- claimcard：理赔支持状态、估算赔付、判断理由、待确认条件。
- drugcheckcard：药品目录、适应症、处方医生、购药渠道、医保报销、慈善援助或耐药。
- hospitalcard：医院、药店、治疗机构或购买渠道范围。
- enrollmentcard：投保资格、版本入口、保费、等待期、保障期间。
- materialcard：理赔材料、申请流程、办理步骤。
- versioncomparecard：普通版、关爱版、新市民版差异。
- evidencecard：关键事实和证据锚点。
- nextstepcard：下一步要问用户什么、要准备什么、如何继续判断。
- exclusioncard：免责、限制、不支持或高风险边界。

可用知识域：
${availableDomains}

输出要求：
1. 只输出 Markdown 草稿，不要输出 JSON，不要 fenced code block。
2. 草稿要清楚表达：用户到底问了什么、回答应该往哪个方向展开、建议按什么顺序展示、每张卡片承担什么任务、哪些字段或事实需要第二段补齐。
3. 你可以输出“文字 + 卡片 + 文字 + 卡片 + 文字”的任意组合，格式由你根据问题判断。
4. 不要写最终事实结论；涉及赔付比例、保额、药品目录、适应症、医院范围时，只写“第二段需核验/补齐”。
5. 如果某一部分信息不足，不要阻塞其他部分；把它设计成待确认段或 nextstepcard。
6. 最后给出一条渲染规则，说明第二段应按你的草稿顺序输出正文和对应 JSON 卡片。

建议草稿格式：
# 回答编排草稿

## 用户问题理解
- ...

## 回答方向
- ...

## 建议输出顺序
1. 文字：...
2. 卡片：coveragecard，用途：...，第二段需补齐：...
3. 文字：...
4. 卡片：drugcheckcard，用途：...，第二段需补齐：...

## 需要第二段补齐的信息
- ...

## 渲染规则
- 每个文字段后紧跟对应 fenced JSON 卡片；不要把所有 JSON 集中放在最后。`;

  return {
    prompt,
    snippets: [],
    profile: {
      mode: "two_stage",
      stage: "planner",
      label: "两段式编排",
      charCount: prompt.length,
      selectedSnippets: domainNames,
      routePreview: orchestration.route,
    },
  };
}

function buildTwoStageRendererPrompt(rootDir, orchestration, answerPlan) {
  const snippets = retrieveWiki(rootDir, orchestration.route);
  const joined = snippets.map(({ name, text }) => `===== wiki:${name} =====\n${text}`).join("\n\n");
  const planText = typeof answerPlan === "string" ? answerPlan : JSON.stringify(answerPlan);
  const prompt = `你是保险问答的第二段 Grounded Renderer。你会收到第一段的回答编排草稿、本地规则结果和命中的 wiki。请严格按草稿的展示顺序输出最终用户可读答案，并补齐 fenced JSON 卡片。

第一段回答编排草稿：
${planText}

本地编排结果：
${JSON.stringify(orchestrationPayload(orchestration))}

最终输出要求：
1. 用中文 Markdown 回答用户。
2. 不要输出第一段草稿，不要解释你的内部过程。
3. 第一段只决定表达结构，不是事实来源；事实必须服从本地编排结果和 wiki。
4. 尽量按第一段草稿的“文字 + 卡片 + 文字 + 卡片”顺序输出；如果草稿和本地规则冲突，以本地规则/wiki 为准，但保持相近的展示节奏。
5. 每个文字段后紧跟对应 fenced json 卡片；不要把所有内容汇总后再集中输出 JSON。
6. JSON 卡片字段必须符合 wiki/render.md；缺字段时从 wiki、ruleResults、slots 中补齐。
7. 如果依据不足，卡片状态用“待确认”，不要编造确定赔付结论。
8. 如果第一段选择了不合适的卡片类型，可以换成更合适的可渲染卡片，但要保留第一段的回答意图。
9. 对药品问题必须覆盖目录、适应症、处方医生、购药渠道、慈善援助/耐药/医保报销等限制中与问题相关的部分。
10. 对理赔问题必须覆盖免赔额、赔付比例、医保/互助帮困前置、既往症或待确认信息。
11. 不要输出思考过程，不要虚构未提供的条款、金额、比例或医疗事实。

${joined}`;

  return {
    prompt,
    snippets,
    profile: {
      mode: "two_stage",
      stage: "renderer",
      label: "两段式编排",
      charCount: prompt.length,
      selectedSnippets: snippets.map(item => item.name),
      routePreview: orchestration.route,
    },
  };
}

module.exports = {
  buildFullPrompt,
  buildPlannerPrompt,
  buildReportPrompt,
  buildTwoStageRendererPrompt,
  buildWikiPrompt,
};
