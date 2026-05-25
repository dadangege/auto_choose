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
  const snippets = retrieveWiki(rootDir, orchestration.route);
  const snippetHints = snippets
    .map(({ name }) => `- wiki/${name}.md`)
    .join("\n");
  const prompt = `你是保险问答的第一段编排器。你的任务不是给最终答案，而是输出一个可复用的结构化草稿计划，供第二段模型基于 wiki 补齐事实和 JSON 卡片。

本地编排结果：
${JSON.stringify(orchestrationPayload(orchestration))}

可用 wiki 域：
${snippetHints}

只输出一个 JSON 对象，不要 Markdown，不要解释，不要输出思考过程。JSON 结构如下：
{
  "answer_plan": {
    "question_summary": "一句话概括用户问题",
    "global_context": ["已确认的产品版本、既往症、医保结算等共享条件"],
    "sections": [
      {
        "intent": "route.intents 中的 intent type",
        "display_title": "给用户看的段落标题",
        "answer_direction": "这一段最终应该回答什么",
        "must_cover": ["必须覆盖的事实、限制、待确认点"],
        "card_sequence": ["先输出哪些卡片类型"],
        "required_json_fields": {
          "card_type": ["第二段必须补齐的字段名"]
        },
        "wiki_needed": ["需要检索的 wiki 文件名"],
        "missing_info": ["仍需用户补充的信息；没有则空数组"]
      }
    ],
    "rendering_rule": "最终回答必须按 内容 + json + 内容 + json 的相邻顺序输出"
  }
}

编排要求：
1. sections 必须和 route.intents 顺序一致。
2. 每个 section 优先采用 cardPlan.sections 中的 primary_card 与 supporting_cards。
3. 不要制造本地编排结果里没有的赔付比例、药品结论或医院范围。
4. 如果某个 intent 信息不足，只在 missing_info 标注，不要阻塞其他 intent。`;

  return {
    prompt,
    snippets,
    profile: {
      mode: "two_stage",
      stage: "planner",
      label: "两段式编排",
      charCount: prompt.length,
      selectedSnippets: snippets.map(item => item.name),
      routePreview: orchestration.route,
    },
  };
}

function buildTwoStageRendererPrompt(rootDir, orchestration, answerPlan) {
  const snippets = retrieveWiki(rootDir, orchestration.route);
  const joined = snippets.map(({ name, text }) => `===== wiki:${name} =====\n${text}`).join("\n\n");
  const planText = typeof answerPlan === "string" ? answerPlan : JSON.stringify(answerPlan);
  const prompt = `你是保险问答的第二段事实补齐与渲染器。你会收到第一段的结构化草稿计划、本地编排结果和命中的 wiki。请根据这些信息输出最终用户可读答案，并补齐 fenced JSON 卡片。

第一段结构化草稿计划：
${planText}

本地编排结果：
${JSON.stringify(orchestrationPayload(orchestration))}

最终输出要求：
1. 用中文 Markdown 回答用户。
2. 不要输出第一段草稿，不要解释你的内部过程。
3. 必须按 answer_plan.sections / route.intents 顺序输出。
4. 多意图必须保持“内容 + json + 内容 + json”的相邻结构；不要把所有内容汇总后再集中输出 JSON。
5. 每个意图先给 1-3 句直接解释，再紧跟该意图自己的 fenced json。
6. JSON 卡片字段必须符合 wiki/render.md 和 cardPlan；缺字段时从 wiki、ruleResults、slots 中补齐。
7. 如果依据不足，卡片状态用“待确认”，不要编造确定赔付结论。
8. 对药品问题必须覆盖目录、适应症、处方医生、购药渠道、慈善援助/耐药/医保报销等限制中与问题相关的部分。
9. 对理赔问题必须覆盖免赔额、赔付比例、医保/互助帮困前置、既往症或待确认信息。
10. 不要输出思考过程，不要虚构未提供的条款、金额、比例或医疗事实。

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
