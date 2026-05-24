const fs = require("fs");
const path = require("path");

const WIKI_FILE_MAP = {
  base: "base.md",
  policy: "policy.md",
  coverage: "coverage.md",
  drug: "drug.md",
  hospital: "hospital.md",
  enrollment: "enrollment.md",
  claim: "claim.md",
  exclusion: "exclusion.md",
  render: "render.md",
};

function readWiki(rootDir, name) {
  const fileName = WIKI_FILE_MAP[name];
  if (!fileName) return "";
  return fs.readFileSync(path.join(rootDir, "wiki", fileName), "utf8").trim();
}

function retrieveWiki(rootDir, route) {
  const selected = ["base", "policy", "render"];

  if (route.policy.status !== "confirmed") selected.push("policy");

  for (const intent of route.intents) {
    if (intent.type === "coverage_explanation") selected.push("coverage");
    if (intent.type === "domestic_drug" || intent.type === "drug_prescription_duration") selected.push("drug");
    if (intent.type === "hospital_scope" || intent.type === "hospital_self_pay") selected.push("hospital");
    if (intent.type === "enrollment") selected.push("enrollment");
    if (intent.type === "claim_process" || intent.type === "materials" || intent.type === "hospital_self_pay") selected.push("claim");
  }

  selected.push("exclusion");

  const names = [...new Set(selected)];
  return names.map(name => ({
    name,
    text: readWiki(rootDir, name),
  }));
}

module.exports = {
  retrieveWiki,
};

