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
    ["references/claim-judge.md", path.join(rootDir, "references", "claim-judge.md")],
    ["references/answer-render.md", path.join(rootDir, "references", "answer-render.md")],
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

function buildWikiPrompt(rootDir, orchestration) {
  const snippets = retrieveWiki(rootDir, orchestration.route);
  const joined = snippets.map(({ name, text }) => `===== wiki:${name} =====\n${text}`).join("\n\n");
  const prompt = `你是保险问答测试助手。下面不是完整 skill，而是本地编排器命中的 Wiki 片段和规则引擎结果。只能基于这些信息回答。

本地编排结果：
${JSON.stringify({
  route: orchestration.route,
  slots: orchestration.slots,
  ruleResults: orchestration.ruleResults,
  validation: orchestration.validation,
}, null, 2)}

执行要求：
1. 按 route.intents 顺序回答。
2. 如果 route.policy.status 是 need_select，先要求用户选择版本，不要输出确定理赔结论。
3. 多意图必须按“内容 + json + 内容 + json”顺序输出。
4. 每个意图的文字说明后，紧跟该意图自己的 fenced json。
5. 优先采用 ruleResults.cards 中已生成的 card 结构；需要补充自然语言解释时再组织表达。
6. 不要输出思考过程，不要虚构未给出的条款。

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
${JSON.stringify({
  route: orchestration.route,
  slots: orchestration.slots,
  ruleResults: orchestration.ruleResults,
  validation: orchestration.validation,
}, null, 2)}

请按本地编排结果中的 route.intents 顺序输出。多意图时必须保持“内容 + json + 内容 + json”的相邻结构。`;
  return {
    prompt,
    snippets: [],
    profile: {
      mode: "full",
      label: "完整 Skill",
      charCount: prompt.length,
      selectedSnippets: ["SKILL.md", "policy-select.md", "claim-judge.md", "answer-render.md"],
      routePreview: orchestration.route,
    },
  };
}

module.exports = {
  buildFullPrompt,
  buildWikiPrompt,
};

