#!/usr/bin/env node
const assert = require("assert");
const { orchestrate, buildPrompt, buildTwoStagePrompts, routePreview } = require("../orchestrator");

const cases = [
  {
    name: "generic_huhuibao_requires_selection",
    query: "我买了沪惠保，住院自费能不能赔？",
    check(result) {
      assert.equal(result.policy.status, "need_select");
      assert.equal(result.intents[0].type, "hospital_self_pay");
      assert.equal(result.ruleResults.cards[0].card.type, "policyselectcard");
    },
  },
  {
    name: "new_citizen_hospital_and_drug_multi_intent",
    query: "我买的是新市民版，住院自费3万，没走当地医保，我不是既往症。另外奥希替尼能不能报？",
    check(result) {
      assert.equal(result.policy.version, "新市民版");
      assert.deepEqual(result.intents.map(item => item.type), ["hospital_self_pay", "domestic_drug"]);
      const hospital = result.ruleResults.cards[0].card;
      const drug = result.ruleResults.cards[1].card;
      assert.equal(hospital.claim_scene.support_status, "支持");
      assert.equal(hospital.estimated_payment.estimated_result, 3600);
      assert.equal(drug.claim_scene.support_status, "待确认");
      assert.equal(result.cardPlan.sections.length, 2);
      assert(result.cardPlan.sections[0].source_anchors.includes("R002"));
      assert(result.cardPlan.sections[1].supporting_cards.some(card => card.type === "drugcheckcard"));
      assert.equal(result.validation.ok, true);
    },
  },
  {
    name: "coverage_then_drug_multi_intent",
    query: "我买的是新市民版，保障责任都有什么。另外奥希替尼能不能报？",
    check(result) {
      assert.deepEqual(result.intents.map(item => item.type), ["coverage_explanation", "domestic_drug"]);
      assert.deepEqual(result.ruleResults.cards.map(item => item.card.type), ["coveragecard", "claimcard"]);
      assert.equal(result.validation.ok, true);
    },
  },
  {
    name: "hospital_claim_enrollment_domains",
    query: "新市民版可以去哪些医院理赔？我还能投保吗？",
    check(result) {
      assert.deepEqual(result.intents.map(item => item.type), ["hospital_scope", "claim_process", "enrollment"]);
      assert.deepEqual(result.ruleResults.cards.map(item => item.card.type), ["hospitalcard", "materialcard", "enrollmentcard"]);
      const preview = routePreview(result.query);
      assert(preview.promptProfiles.wiki.selectedSnippets.includes("hospital"));
      assert(preview.promptProfiles.wiki.selectedSnippets.includes("claim"));
      assert(preview.promptProfiles.wiki.selectedSnippets.includes("enrollment"));
    },
  },
  {
    name: "prompt_bundle_contains_rule_results",
    query: "我买的是新市民版，保障责任都有什么。另外奥希替尼能不能报？",
    check() {
      const bundle = buildPrompt("我买的是新市民版，保障责任都有什么。另外奥希替尼能不能报？", "wiki");
      assert(bundle.prompt.includes("本地编排结果"));
      assert(bundle.prompt.includes("ruleResults"));
      assert(bundle.prompt.includes("cardPlan"));
      assert(bundle.profile.charCount < 7000);
    },
  },
  {
    name: "report_prompt_uses_reader_structure",
    query: "我买的是新市民版，保障责任都有什么。另外奥希替尼能不能报？",
    check() {
      const bundle = buildPrompt("我买的是新市民版，保障责任都有什么。另外奥希替尼能不能报？", "report");
      assert.equal(bundle.profile.mode, "report");
      assert(bundle.prompt.includes("保障地图"));
      assert(bundle.prompt.includes("证据链"));
      assert(bundle.prompt.includes("cardPlan"));
      assert(bundle.prompt.includes("D001"));
    },
  },
  {
    name: "two_stage_prompt_has_planner_and_renderer",
    query: "我买的是新市民版，保障责任都有什么。另外奥希替尼能不能报？",
    check() {
      const plannerOnly = buildPrompt("我买的是新市民版，保障责任都有什么。另外奥希替尼能不能报？", "two_stage");
      assert.equal(plannerOnly.profile.mode, "two_stage");
      assert.equal(plannerOnly.profile.stage, "planner");
      assert(plannerOnly.prompt.includes("answer_plan"));

      const twoStage = buildTwoStagePrompts(
        "我买的是新市民版，保障责任都有什么。另外奥希替尼能不能报？",
        "{\"answer_plan\":{\"sections\":[]}}"
      );
      assert(twoStage.renderer.prompt.includes("第一段结构化草稿计划"));
      assert(twoStage.renderer.prompt.includes("内容 + json + 内容 + json"));
      assert.equal(twoStage.renderer.profile.mode, "two_stage");

      const preview = routePreview("我买的是新市民版，保障责任都有什么。另外奥希替尼能不能报？");
      assert.equal(preview.promptProfiles.two_stage.label, "两段式编排");
    },
  },
  {
    name: "version_compare_and_exclusion_routes",
    query: "新市民版和普通版有什么区别？哪些情况不能赔？",
    check(result) {
      assert.deepEqual(result.intents.map(item => item.type), ["version_comparison", "exclusion"]);
      assert.deepEqual(result.ruleResults.cards.map(item => item.card.type), ["versioncomparecard", "exclusioncard"]);
      assert.equal(result.validation.ok, true);
    },
  },
];

let failures = 0;
for (const testCase of cases) {
  try {
    const result = orchestrate(testCase.query);
    testCase.check(result);
    console.log(`PASS ${testCase.name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${testCase.name}`);
    console.error(error.stack || error.message);
  }
}

process.exit(failures ? 1 : 0);
