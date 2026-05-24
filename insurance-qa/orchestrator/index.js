const path = require("path");
const { routeQuery } = require("./router");
const { extractSlots } = require("./slot-extractor");
const { evaluateRules } = require("./rules");
const { validateCards } = require("./validator");
const { buildFullPrompt, buildWikiPrompt } = require("./prompt-builder");

const ROOT = path.resolve(__dirname, "..");

function orchestrate(query) {
  const route = routeQuery(query);
  const slots = extractSlots(query);
  const ruleResults = evaluateRules(query, route, slots);
  const validation = validateCards(ruleResults.cards, route.intents);
  return {
    query,
    route,
    policy: route.policy,
    intents: route.intents,
    slots,
    ruleResults,
    validation,
  };
}

function buildPrompt(query, mode = "wiki") {
  const orchestration = orchestrate(query);
  const bundle = mode === "full"
    ? buildFullPrompt(ROOT, orchestration)
    : buildWikiPrompt(ROOT, orchestration);
  return {
    ...bundle,
    orchestration,
  };
}

function routePreview(query) {
  const orchestration = orchestrate(query);
  const wikiBundle = buildWikiPrompt(ROOT, orchestration);
  const fullBundle = buildFullPrompt(ROOT, orchestration);
  return {
    policy: orchestration.policy,
    intents: orchestration.intents,
    slots: orchestration.slots,
    ruleResults: orchestration.ruleResults,
    validation: orchestration.validation,
    promptProfiles: {
      wiki: wikiBundle.profile,
      full: fullBundle.profile,
    },
  };
}

module.exports = {
  buildPrompt,
  orchestrate,
  routePreview,
};

