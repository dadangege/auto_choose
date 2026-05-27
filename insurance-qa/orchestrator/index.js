const path = require("path");
const { routeQuery } = require("./router");
const { extractSlots } = require("./slot-extractor");
const { evaluateRules } = require("./rules");
const { validateCards } = require("./validator");
const { buildCardPlan } = require("./card-planner");
const { buildEvidenceView } = require("./evidence-bank");
const {
  buildFullPrompt,
  buildPlannerPrompt,
  buildReportPrompt,
  buildTwoStageRendererPrompt,
  buildWikiPrompt,
} = require("./prompt-builder");

const ROOT = path.resolve(__dirname, "..");

function orchestrate(query) {
  const route = routeQuery(query);
  const slots = extractSlots(query);
  const ruleResults = evaluateRules(query, route, slots);
  const cardPlan = buildCardPlan(route, slots, ruleResults);
  const validation = validateCards(ruleResults.cards, route.intents);
  return {
    query,
    route,
    policy: route.policy,
    intents: route.intents,
    slots,
    ruleResults,
    cardPlan,
    validation,
  };
}

function buildPrompt(query, mode = "wiki") {
  const orchestration = orchestrate(query);
  let bundle;
  if (mode === "full") {
    bundle = buildFullPrompt(ROOT, orchestration);
  } else if (mode === "report") {
    bundle = buildReportPrompt(ROOT, orchestration);
  } else if (mode === "two_stage") {
    bundle = buildPlannerPrompt(ROOT, orchestration);
  } else {
    bundle = buildWikiPrompt(ROOT, orchestration);
  }
  return {
    ...bundle,
    orchestration,
  };
}

function buildTwoStagePrompts(query, answerPlan = "") {
  const orchestration = orchestrate(query);
  const planner = buildPlannerPrompt(ROOT, orchestration);
  const renderer = answerPlan ? buildTwoStageRendererPrompt(ROOT, orchestration, answerPlan) : null;
  return {
    orchestration,
    planner,
    renderer,
  };
}

function routePreview(query) {
  const orchestration = orchestrate(query);
  const wikiBundle = buildWikiPrompt(ROOT, orchestration);
  const fullBundle = buildFullPrompt(ROOT, orchestration);
  const reportBundle = buildReportPrompt(ROOT, orchestration);
  const plannerBundle = buildPlannerPrompt(ROOT, orchestration);
  return {
    policy: orchestration.policy,
    intents: orchestration.intents,
    slots: orchestration.slots,
    ruleResults: orchestration.ruleResults,
    cardPlan: orchestration.cardPlan,
    validation: orchestration.validation,
    promptProfiles: {
      wiki: wikiBundle.profile,
      full: fullBundle.profile,
      report: reportBundle.profile,
      two_stage: {
        ...plannerBundle.profile,
        label: "两段式编排",
        stage: "planner",
      },
    },
  };
}

function evidencePreview(query, cards = []) {
  const orchestration = orchestrate(query);
  return buildEvidenceView(orchestration, cards);
}

module.exports = {
  buildPrompt,
  buildTwoStagePrompts,
  evidencePreview,
  orchestrate,
  routePreview,
};
